import {
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

// S165: the one host on which the Google sign-in helper is served from the app's own origin
// (through /__/auth/*) AND registered as an OAuth redirect address. Unset by default: the app then
// keeps the Firebase-hosted helper and signs in through a Google window only. It is an explicit
// statement that the redirect address is registered, never an inference from the current host.
const sameOriginAuthHost = process.env.NEXT_PUBLIC_FIREBASE_SAME_ORIGIN_AUTH_HOST;

let clientApp: FirebaseApp | null = null;

export function hasFirebaseBrowserConfig() {
  return Object.values(firebaseConfig).every(isNonEmptyString);
}

export function getFirebaseClientAuth(): Auth {
  return getAuth(getFirebaseClientApp());
}

/**
 * Chooses the sign-in helper host. The app's own host is used only when the explicit same-origin
 * key names exactly the host this page is served from; every other host (a release candidate
 * address, localhost, an unset key, a malformed key) keeps the configured Firebase helper domain.
 */
export function resolveFirebaseAuthDomain(input: {
  readonly configuredAuthDomain: string;
  readonly sameOriginAuthHost?: string | null;
  readonly currentHost?: string | null;
}): { readonly authDomain: string; readonly sameOrigin: boolean } {
  const declared = normalizeHost(input.sameOriginAuthHost);
  const current = normalizeHost(input.currentHost);

  if (declared && current && declared === current) {
    return { authDomain: declared, sameOrigin: true };
  }

  return { authDomain: input.configuredAuthDomain, sameOrigin: false };
}

/**
 * True only when this page's own origin serves the sign-in helper, which is the one arrangement
 * in which a full-page Google redirect can return to the app in current browsers. With the
 * Firebase-hosted helper the redirect cannot complete, so the app must not start one.
 */
export function firebaseRedirectSignInAvailable() {
  if (!isNonEmptyString(firebaseConfig.authDomain)) {
    return false;
  }

  return resolveFirebaseAuthDomain({
    configuredAuthDomain: firebaseConfig.authDomain,
    sameOriginAuthHost,
    currentHost: currentBrowserHost(),
  }).sameOrigin;
}

function getFirebaseClientApp() {
  if (clientApp) {
    return clientApp;
  }

  if (!hasFirebaseBrowserConfig()) {
    throw new Error("Firebase browser configuration is incomplete.");
  }

  clientApp = getApps()[0] ?? initializeApp(readFirebaseBrowserConfig());
  return clientApp;
}

function readFirebaseBrowserConfig(): FirebaseOptions {
  return {
    apiKey: readConfigValue(firebaseConfig.apiKey),
    appId: readConfigValue(firebaseConfig.appId),
    authDomain: resolveFirebaseAuthDomain({
      configuredAuthDomain: readConfigValue(firebaseConfig.authDomain),
      sameOriginAuthHost,
      currentHost: currentBrowserHost(),
    }).authDomain,
    projectId: readConfigValue(firebaseConfig.projectId),
  };
}

function currentBrowserHost() {
  return typeof window === "undefined" ? null : window.location.host;
}

// A bare host with an optional port. Anything else (a scheme, a path, whitespace) is ignored.
function normalizeHost(value: string | null | undefined) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const host = value.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/.test(host) ? host : null;
}

function readConfigValue(value: string | undefined) {
  if (!isNonEmptyString(value)) {
    throw new Error("Firebase browser configuration is incomplete.");
  }

  return value.trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
