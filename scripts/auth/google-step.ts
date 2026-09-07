// S112 — the pure decision behind the canary sign-in. On a Google page the only automated action is
// selecting the expected account tile; every credential, challenge, consent, or identifier page is
// a human step that is reported, never worked around.

export type Location = "app" | "app-sign-in" | "auth-handler" | "google" | "other";

export type GoogleStepAction = "app" | "click-account" | "human" | "wait";

export interface GoogleStepDecision {
  readonly action: GoogleStepAction;
  readonly reason: string;
}

export interface GoogleStepInput {
  readonly url: string;
  readonly appOrigin: string;
  readonly exactAccountTileVisible: boolean;
  readonly accountTileClicked: boolean;
  readonly passwordOrChallengeVisible: boolean;
}

export function classifyLocation(url: string, appOrigin: string): Location {
  let parsed: URL;
  let app: URL;
  try {
    parsed = new URL(url);
    app = new URL(appOrigin);
  } catch {
    return "other";
  }
  if (parsed.origin === app.origin) {
    return parsed.pathname === "/sign-in" ? "app-sign-in" : "app";
  }
  if (parsed.pathname.startsWith("/__/auth/")) return "auth-handler";
  const host = parsed.hostname.toLowerCase();
  if (host === "accounts.google.com" || host.endsWith(".accounts.google.com"))
    return "google";
  if (
    (host === "google.com" || host.endsWith(".google.com")) &&
    parsed.pathname.startsWith("/signin")
  ) {
    return "google";
  }
  return "other";
}

export function decideGoogleStep(input: GoogleStepInput): GoogleStepDecision {
  const location = classifyLocation(input.url, input.appOrigin);
  if (location === "app")
    return { action: "app", reason: "the app accepted the session" };
  if (location === "app-sign-in") {
    return { action: "wait", reason: "the app's sign-in page is still completing" };
  }
  if (location === "auth-handler") {
    return { action: "wait", reason: "the Firebase handler is redirecting" };
  }
  if (location === "other")
    return { action: "wait", reason: "an intermediate page is loading" };

  if (input.passwordOrChallengeVisible) {
    return { action: "human", reason: "Google is asking for a password or a challenge" };
  }
  const path = safePath(input.url);
  if (/\/challenge\//.test(path)) {
    return { action: "human", reason: "Google is asking for a challenge" };
  }
  if (/consent/.test(path)) {
    return { action: "human", reason: "Google is asking for consent" };
  }
  if (/\/identifier/.test(path)) {
    return {
      action: "human",
      reason:
        "Google is asking for an email address; this profile holds no Google session",
    };
  }
  if (input.exactAccountTileVisible && !input.accountTileClicked) {
    return { action: "click-account", reason: "selecting the expected account" };
  }
  if (/accountchooser|oauthchooseaccount|selectaccount/.test(path)) {
    return input.accountTileClicked
      ? { action: "wait", reason: "the account was selected" }
      : {
          action: "human",
          reason: "Google's account chooser does not list the expected account",
        };
  }
  return { action: "wait", reason: "Google is redirecting" };
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}
