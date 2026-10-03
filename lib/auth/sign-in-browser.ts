// S165: what the sign-in page can know about the browser it runs in, and the plain copy it shows
// when Google sign-in cannot finish. Pure functions only: nothing here authenticates anyone, reads a
// credential or changes who may sign in. The server session checks are unchanged.

export type SignInBrowserKind = "desktop" | "mobile" | "in_app";
export type SignInBrowserPlatform = "ios" | "android" | "other";

export interface SignInBrowser {
  readonly kind: SignInBrowserKind;
  readonly platform: SignInBrowserPlatform;
}

// Apps that open links in their own embedded browser. Google sign-in windows usually cannot open
// or finish there, so the page tells the person to use the phone's own browser instead.
const IN_APP_TOKENS =
  /\bGSA\/|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|LinkedInApp|Snapchat|Pinterest|musical_ly|BytedanceWebview|TikTok|Twitter|Slack|Teams|; wv\)/;

/**
 * Classifies the browser from its user agent. `maxTouchPoints` distinguishes an iPad that reports a
 * desktop user agent. An unknown or empty user agent is treated as a desktop browser, which keeps
 * the ordinary sign-in window as the default.
 */
export function detectSignInBrowser(
  userAgent: string | null | undefined,
  maxTouchPoints = 0,
): SignInBrowser {
  const ua = userAgent ?? "";
  const isIos =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const platform: SignInBrowserPlatform = isIos ? "ios" : isAndroid ? "android" : "other";

  if (IN_APP_TOKENS.test(ua)) {
    return { kind: "in_app", platform };
  }

  // Every real iOS browser (Safari, Chrome, Firefox, Edge) carries a Safari token. An iOS user
  // agent without one is an app's embedded web view.
  if (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua)) {
    return { kind: "in_app", platform };
  }

  if (isIos || isAndroid || /Mobile/.test(ua)) {
    return { kind: "mobile", platform };
  }

  return { kind: "desktop", platform };
}

/** The phone browser to name in an instruction. */
export function deviceBrowserName(platform: SignInBrowserPlatform) {
  if (platform === "ios") {
    return "Safari";
  }

  if (platform === "android") {
    return "Chrome";
  }

  return "Safari or Chrome";
}

export const SIGN_IN_COPY = {
  popupOpen:
    "Finish signing in with Google in the window that opened. If no window opened, select Sign in with Google again.",
  popupClosed:
    "The Google window closed before sign-in finished. Select Sign in with Google to try again.",
  openingInTab: "Opening Google sign-in in this tab.",
  resumedExpired: "Your earlier sign-in ended. Sign in with Google to continue.",
  sessionRejected:
    "Google sign-in finished, but PMI KC KB could not start your session. Select Sign in with Google to try again.",
  sessionUnavailable:
    "PMI KC KB could not start your session right now. Wait a moment, then try again.",
  sessionNotKept:
    "Sign-in finished, but this browser did not keep it. Allow cookies for this site, or turn off private browsing, then sign in again.",
  redirectIncomplete:
    "Google sign-in did not finish in this browser. Select Sign in with Google to try again.",
  generic:
    "Google sign-in did not finish. Select Sign in with Google to try again. If it keeps happening, tell your administrator.",
} as const;

/** The instruction shown when this browser cannot open the Google sign-in window at all. */
export function popupUnavailableMessage(browser: SignInBrowser) {
  const name = deviceBrowserName(browser.platform);

  if (browser.kind === "in_app") {
    return `Google sign-in cannot open inside this app. Open this page in ${name}, then sign in there.`;
  }

  if (browser.kind === "mobile") {
    return `Google sign-in needs to open a new tab. Allow pop-ups for this site in ${name}, then select Sign in with Google again.`;
  }

  return "Google sign-in needs a pop-up window. Allow pop-ups for this site, then select Sign in with Google again.";
}

/**
 * Plain, actionable copy for a Firebase sign-in failure. The provider's own error text is never
 * shown: it names internal codes and helper pages that the person cannot act on.
 */
export function signInFailureMessage(code: string, browser: SignInBrowser): string {
  switch (code) {
    case "auth/popup-blocked":
    case "auth/operation-not-supported-in-this-environment":
      return popupUnavailableMessage(browser);
    case "auth/popup-closed-by-user":
    case "auth/user-cancelled":
    case "auth/redirect-cancelled-by-user":
    case "auth/cancelled-popup-request":
      return SIGN_IN_COPY.popupClosed;
    case "auth/network-request-failed":
    case "auth/timeout":
      return "Google sign-in could not connect. Check your connection, then try again.";
    case "auth/web-storage-unsupported":
      return "This browser is not keeping site data, so sign-in cannot finish. Allow cookies and site data, or turn off private browsing, then try again.";
    case "auth/unauthorized-domain":
      return "Google sign-in is not set up for this web address. Open PMI KC KB from its usual link, or tell your administrator.";
    case "auth/too-many-requests":
      return "Google paused sign-in after several attempts. Wait a few minutes, then try again.";
    case "auth/user-disabled":
      return "This Google account is turned off for PMI KC KB. Ask your administrator for help.";
    case "auth/user-token-expired":
    case "auth/requires-recent-login":
      return SIGN_IN_COPY.resumedExpired;
    default:
      return browser.kind === "in_app"
        ? `Google sign-in did not finish inside this app. Open this page in ${deviceBrowserName(browser.platform)}, then sign in there.`
        : SIGN_IN_COPY.generic;
  }
}

/** Reads a Firebase-style error code without trusting the error's shape. */
export function readAuthErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : "";
  }

  return "";
}
