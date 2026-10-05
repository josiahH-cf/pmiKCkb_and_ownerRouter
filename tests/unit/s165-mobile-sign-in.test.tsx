// @vitest-environment jsdom

// S165 mobile sign-in repair. The reported phone failure was an in-app browser whose Google window
// could not open; the panel then started a full-page redirect that cannot return while the sign-in
// helper is hosted on a different origin. These tests pin the repaired paths: a redirect is started
// only when the helper is served from the app's own origin, every failure shows plain actionable
// copy, a stale remembered sign-in ends quietly, and a completed sign-in returns to the page the
// person was opening. Identity and session checks are unchanged: every path still posts the Google
// ID token to the same staff session route.

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(() => Promise.resolve(null)),
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
  redirectAvailable: vi.fn(() => false),
  providerParameters: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {
    setCustomParameters = mocks.providerParameters;
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
  firebaseRedirectSignInAvailable: mocks.redirectAvailable,
}));

import { SignInPanel } from "@/components/auth/SignInPanel";

const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
// The family observed in the request log for the reported failure: the Google app's own browser.
const IOS_GOOGLE_APP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/440.0.0 Mobile/15E148 Safari/604.1";

const REDIRECT_PENDING_KEY = "pmi-kc:google-redirect-pending";
const originalUserAgent = window.navigator.userAgent;

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value });
}

function googleUser(token = "id-token") {
  return { getIdToken: vi.fn().mockResolvedValue(token) };
}

function stubSessionFetch({
  postStatus = 200,
  postError = "Authentication is required.",
  checkStatus = 204,
}: { postStatus?: number; postError?: string; checkStatus?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const status = method === "POST" ? postStatus : checkStatus;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (status >= 400 ? { error: postError } : { user: {} }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function signInButton() {
  return screen.findByRole("button", { name: "Sign in with Google" });
}

beforeEach(() => {
  setUserAgent(DESKTOP_CHROME);
  window.sessionStorage.clear();
  mocks.redirectAvailable.mockReturnValue(false);
  mocks.getRedirectResult.mockResolvedValue(null);
  mocks.signOut.mockResolvedValue(undefined);
  mocks.signInWithRedirect.mockResolvedValue(undefined);
  mocks.onAuthStateChanged.mockImplementation(
    (_auth: unknown, cb: (user: unknown) => void) => {
      cb(null);
      return () => {};
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  setUserAgent(originalUserAgent);
  vi.useRealTimers();
});

it("S170 an in-app-browser page-link copy acknowledges and bounds its actual clipboard wait", async () => {
  setUserAgent(IOS_GOOGLE_APP);
  vi.useFakeTimers();
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(() => new Promise(() => {})) },
  });
  try {
    render(<SignInPanel allowedHostedDomain="example.test" returnTo="/work" />);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    fireEvent.click(screen.getByRole("button", { name: "Copy page link" }));
    expect(screen.getByRole("status", { name: "Copying page link" })).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(8_001));
    expect(screen.getByLabelText<HTMLInputElement>("Page link").value).toBe(
      new URL("/work", window.location.origin).href,
    );
    expect(screen.queryByText("Link copied.")).toBeNull();
  } finally {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
it("S170 a page-link copy retired by a new return destination cannot confirm that new link copied", async () => {
  setUserAgent(IOS_GOOGLE_APP);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(() => pending) },
  });
  try {
    const owner = render(
      <SignInPanel allowedHostedDomain="example.test" returnTo="/work" />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Copy page link" }));
    await act(async () => {});
    owner.rerender(
      <SignInPanel allowedHostedDomain="example.test" returnTo="/connections" />,
    );
    await act(async () => finish());
    expect(screen.queryByText("Link copied.")).toBeNull();
    expect(screen.getByRole("button", { name: "Copy page link" })).toBeEnabled();
  } finally {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

describe("S165 mobile sign-in: which Google path is used", () => {
  it("BEH-S165-1 / AC-S165-1: a browser that cannot open the Google window gets an instruction, never a redirect that cannot return", async () => {
    setUserAgent(IOS_SAFARI);
    mocks.signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });
    stubSessionFetch();

    render(<SignInPanel allowedHostedDomain="example.test" />);
    await userEvent.click(await signInButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Allow pop-ups for this site in Safari",
    );
    expect(mocks.signInWithRedirect).not.toHaveBeenCalled();
    // The control stays usable for the next attempt.
    expect(await signInButton()).toBeEnabled();
  });

  it("AC-S165-1: an in-app browser is told to open the page in the phone browser", async () => {
    setUserAgent(IOS_GOOGLE_APP);
    mocks.signInWithPopup.mockRejectedValue({
      code: "auth/operation-not-supported-in-this-environment",
    });
    stubSessionFetch();

    render(<SignInPanel allowedHostedDomain="example.test" />);

    // The advice is on the page before the person tries, with a touch-reachable copy control.
    expect(await screen.findByText(/Open this page in Safari/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy page link" })).toBeInTheDocument();

    await userEvent.click(await signInButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google sign-in cannot open inside this app. Open this page in Safari, then sign in there.",
    );
    expect(mocks.signInWithRedirect).not.toHaveBeenCalled();
  });

  it("AC-S165-1: with the helper on the app's own origin, a browser without the Google window falls back to a same-tab redirect", async () => {
    mocks.redirectAvailable.mockReturnValue(true);
    mocks.signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });
    stubSessionFetch();

    render(<SignInPanel allowedHostedDomain="example.test" />);
    await userEvent.click(await signInButton());

    await waitFor(() => expect(mocks.signInWithRedirect).toHaveBeenCalledTimes(1));
    expect(window.sessionStorage.getItem(REDIRECT_PENDING_KEY)).toBe("1");
  });

  it.each([
    ["iOS Safari", IOS_SAFARI],
    ["iOS Chrome", IOS_CHROME],
    ["Android Chrome", ANDROID_CHROME],
    ["an in-app browser", IOS_GOOGLE_APP],
  ])(
    "BEH-S165-1: on %s with the helper on the app's own origin, sign-in opens in the same tab",
    async (_label, userAgent) => {
      setUserAgent(userAgent);
      mocks.redirectAvailable.mockReturnValue(true);
      stubSessionFetch();

      render(<SignInPanel allowedHostedDomain="example.test" />);
      await userEvent.click(await signInButton());

      await waitFor(() => expect(mocks.signInWithRedirect).toHaveBeenCalledTimes(1));
      expect(mocks.signInWithPopup).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["iOS Safari", IOS_SAFARI],
    ["iOS Chrome", IOS_CHROME],
    ["Android Chrome", ANDROID_CHROME],
  ])(
    "BEH-S165-1 / BEH-S165-2: on %s with the Firebase-hosted helper, the tap opens the Google window and the same staff session route finishes sign-in",
    async (_label, userAgent) => {
      setUserAgent(userAgent);
      const onSignedIn = vi.fn();
      mocks.signInWithPopup.mockResolvedValue({ user: googleUser("phone-token") });
      const fetchMock = stubSessionFetch();

      render(
        <SignInPanel
          allowedHostedDomain="example.test"
          onSignedIn={onSignedIn}
          returnTo="/lease-renewal/live/desk/lease/1001?deskView=abc"
        />,
      );
      await userEvent.click(await signInButton());

      await waitFor(() =>
        expect(onSignedIn).toHaveBeenCalledWith(
          "/lease-renewal/live/desk/lease/1001?deskView=abc",
        ),
      );
      expect(mocks.signInWithRedirect).not.toHaveBeenCalled();
      // Same hosted-domain restriction and the same session route as desktop.
      expect(mocks.providerParameters).toHaveBeenCalledWith({
        hd: "example.test",
        prompt: "select_account",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/session",
        expect.objectContaining({
          method: "POST",
          headers: { authorization: "Bearer phone-token" },
        }),
      );
    },
  );

  it("AC-S165-1: a second tap while the Google window is open starts a fresh attempt, and the superseded attempt stays quiet", async () => {
    setUserAgent(ANDROID_CHROME);
    let rejectFirst: (reason: unknown) => void = () => {};
    mocks.signInWithPopup
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(() => new Promise(() => {}));
    stubSessionFetch();

    render(<SignInPanel allowedHostedDomain="example.test" />);
    await userEvent.click(await signInButton());

    // The window is open, the control is still reachable, and the page says what to do.
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Finish signing in with Google in the window that opened.",
    );
    const button = await signInButton();
    expect(button).toBeEnabled();

    await userEvent.click(button);
    expect(mocks.signInWithPopup).toHaveBeenCalledTimes(2);

    rejectFirst({ code: "auth/cancelled-popup-request" });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Finish signing in with Google in the window that opened.",
      ),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("S165 mobile sign-in: return navigation", () => {
  it("BEH-S165-1: a completed sign-in without a remembered page opens the Dashboard", async () => {
    const onSignedIn = vi.fn();
    mocks.signInWithPopup.mockResolvedValue({ user: googleUser() });
    stubSessionFetch();

    render(<SignInPanel allowedHostedDomain="example.test" onSignedIn={onSignedIn} />);
    await userEvent.click(await signInButton());

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith("/"));
  });

  it.each([
    "https://elsewhere.example/steal",
    "//elsewhere.example/steal",
    "/\\elsewhere.example",
    "/sign-in",
    "/vendor/tickets/1",
    "/api/auth/session",
  ])(
    "BEH-S165-2: a return address that leaves the staff app (%s) is ignored",
    async (returnTo) => {
      const onSignedIn = vi.fn();
      mocks.signInWithPopup.mockResolvedValue({ user: googleUser() });
      stubSessionFetch();

      render(
        <SignInPanel
          allowedHostedDomain="example.test"
          onSignedIn={onSignedIn}
          returnTo={returnTo}
        />,
      );
      await userEvent.click(await signInButton());

      await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith("/"));
    },
  );
});

describe("S165 mobile sign-in: failures are actionable and truthful", () => {
  it("BEH-S165-9: the provider's own error text is never shown", async () => {
    mocks.signInWithPopup.mockRejectedValue({
      code: "auth/internal-error",
      message: "Firebase: Error (auth/internal-error).",
    });
    stubSessionFetch();

    render(<SignInPanel allowedHostedDomain="example.test" />);
    await userEvent.click(await signInButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Google sign-in did not finish.");
    expect(alert).not.toHaveTextContent(/Firebase|auth\//);
  });

  it("BEH-S165-9: a failed return from Google shows plain copy, not the provider message", async () => {
    mocks.getRedirectResult.mockRejectedValue(
      Object.assign(
        new Error(
          "Unable to process request due to missing initial state. This may happen if browser sessionStorage is inaccessible or accidentally cleared.",
        ),
        { code: "auth/internal-error" },
      ),
    );

    render(<SignInPanel allowedHostedDomain="example.test" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Google sign-in did not finish.");
    expect(alert).not.toHaveTextContent(/sessionStorage|initial state/);
  });

  it("BEH-S165-9: a redirect that comes back with no sign-in says so instead of showing a silent page", async () => {
    window.sessionStorage.setItem(REDIRECT_PENDING_KEY, "1");
    mocks.redirectAvailable.mockReturnValue(true);

    render(<SignInPanel allowedHostedDomain="example.test" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google sign-in did not finish in this browser.",
    );
    expect(window.sessionStorage.getItem(REDIRECT_PENDING_KEY)).toBeNull();
    expect(await signInButton()).toBeEnabled();
  });

  it("BEH-S165-9: a remembered sign-in that the server no longer accepts ends quietly with a prompt to sign in again", async () => {
    const stale = googleUser("stale-token");
    mocks.onAuthStateChanged.mockImplementation(
      (_auth: unknown, cb: (user: unknown) => void) => {
        cb(stale);
        return () => {};
      },
    );
    const onSignedIn = vi.fn();
    stubSessionFetch({
      postStatus: 401,
      postError: "Recent Google sign-in is required.",
    });

    render(<SignInPanel allowedHostedDomain="example.test" onSignedIn={onSignedIn} />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your earlier sign-in ended. Sign in with Google to continue.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent Google sign-in is required.")).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(await signInButton()).toBeEnabled();
  });

  it("BEH-S165-9: a fresh sign-in the server does not accept shows plain copy, not the server string", async () => {
    mocks.signInWithPopup.mockResolvedValue({ user: googleUser() });
    stubSessionFetch({ postStatus: 401, postError: "Authentication is required." });

    render(<SignInPanel allowedHostedDomain="example.test" />);
    await userEvent.click(await signInButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Google sign-in finished, but PMI KC KB could not start your session.",
    );
    expect(alert).not.toHaveTextContent("Authentication is required.");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("BEH-S165-9: a browser that does not keep the session is told so instead of bouncing back to sign-in", async () => {
    setUserAgent(IOS_SAFARI);
    const onSignedIn = vi.fn();
    mocks.signInWithPopup.mockResolvedValue({ user: googleUser() });
    stubSessionFetch({ postStatus: 200, checkStatus: 401 });

    render(<SignInPanel allowedHostedDomain="example.test" onSignedIn={onSignedIn} />);
    await userEvent.click(await signInButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-in finished, but this browser did not keep it.",
    );
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("BEH-S165-2: an account outside the staff boundary is refused on a phone exactly as on desktop", async () => {
    setUserAgent(ANDROID_CHROME);
    const onSignedIn = vi.fn();
    mocks.signInWithPopup.mockResolvedValue({ user: googleUser() });
    stubSessionFetch({
      postStatus: 403,
      postError: "Vendor identities cannot use the internal application session.",
    });

    render(<SignInPanel allowedHostedDomain="example.test" onSignedIn={onSignedIn} />);
    await userEvent.click(await signInButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "This Google account is not authorized for PMI KC KB.",
    );
    expect(alert).not.toHaveTextContent("Vendor identities");
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("BEH-S165-9: closing the Google window leaves a usable page with a plain note", async () => {
    mocks.signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    stubSessionFetch();

    render(<SignInPanel allowedHostedDomain="example.test" />);
    await userEvent.click(await signInButton());

    expect(await screen.findByRole("status")).toHaveTextContent(
      "The Google window closed before sign-in finished.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.signInWithRedirect).not.toHaveBeenCalled();
    expect(await signInButton()).toBeEnabled();
  });
});
