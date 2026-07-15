// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  enroll: vi.fn(),
  multiFactor: vi.fn(),
  generateSecret: vi.fn(),
  enrollmentAssertion: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: mocks.signIn,
  signOut: mocks.signOut,
  multiFactor: mocks.multiFactor,
  getMultiFactorResolver: vi.fn(),
  TotpMultiFactorGenerator: {
    FACTOR_ID: "totp",
    generateSecret: mocks.generateSecret,
    assertionForEnrollment: mocks.enrollmentAssertion,
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
});

describe("Vendor TOTP enrollment", () => {
  it("requires a fresh password plus TOTP sign-in after enrollment", async () => {
    const user = userEvent.setup();
    const firebaseUser = { uid: "uid-test-summit", getIdToken: vi.fn() };
    mocks.signIn.mockResolvedValue({ user: firebaseUser });
    mocks.generateSecret.mockResolvedValue({ secretKey: "TEST-TOTP-SETUP" });
    mocks.enrollmentAssertion.mockReturnValue({ assertion: "totp" });
    mocks.enroll.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue(undefined);
    mocks.multiFactor.mockReturnValue({
      enrolledFactors: [],
      getSession: vi.fn().mockResolvedValue({ session: "mfa" }),
      enroll: mocks.enroll,
    });

    render(<VendorSignIn />);
    await user.type(
      screen.getByRole("textbox", { name: "Verified Vendor email" }),
      "service@summit-plumbing.example.invalid",
    );
    await user.type(screen.getByLabelText("Password"), "temporary-password");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(/Setup key: TEST-TOTP-SETUP/)).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Authenticator code" }),
      "123456",
    );
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText(/TOTP enrolled. Sign in again/i)).toBeInTheDocument();
    expect(mocks.enroll).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(firebaseUser.getIdToken).not.toHaveBeenCalled();
  });
});
