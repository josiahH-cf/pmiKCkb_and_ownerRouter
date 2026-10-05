"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { boundedLocalWait } from "@/lib/ui/local-lifetime";
import { useOperation } from "@/components/hooks/useOperation";
import { BusyIndicator } from "@/components/ui/BusyIndicator";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { clearReturnPathInBrowser, safeReturnPath } from "@/lib/auth/return-to";
import {
  SIGN_IN_COPY,
  detectSignInBrowser,
  deviceBrowserName,
  popupUnavailableMessage,
  readAuthErrorCode,
  signInFailureMessage,
  type SignInBrowser,
} from "@/lib/auth/sign-in-browser";
import {
  firebaseRedirectSignInAvailable,
  getFirebaseClientAuth,
  hasFirebaseBrowserConfig,
} from "@/lib/firebase/client";

type SignInStatus =
  | "checking"
  | "idle"
  | "opening"
  | "redirecting"
  | "creating"
  | "error";

// "alert" interrupts: sign-in could not finish and the person must act. "status" is a calm note
// (what to do while the Google window is open, or that an earlier sign-in ended).
type SignInNotice = { readonly tone: "alert" | "status"; readonly text: string };

// How a Google identity reached this page. "interactive" is a sign-in the person just performed;
// "resumed" is a sign-in the browser remembered from an earlier visit, which the server may
// rightly no longer accept.
type SignInSource = "interactive" | "resumed";

// Shown when the server rejects the session because the account is not authorized for the internal app
// (wrong hosted domain, unverified email, vendor identity, etc.). A 403 from POST /api/auth/session and
// the page-guard `?error=forbidden` redirect both surface this same friendly copy, so the sign-in popup
// path and the deep-link-guard path stay consistent instead of leaking the raw server error string.
const UNAUTHORIZED_ACCOUNT_MESSAGE =
  "This Google account is not authorized for PMI KC KB.";

const NOT_CONFIGURED_MESSAGE = "Firebase sign-in is not configured for this environment.";

// Set just before a same-tab Google redirect starts and cleared when it returns, so a redirect
// that comes back with no sign-in is reported instead of leaving a silent sign-in page.
const REDIRECT_PENDING_KEY = "pmi-kc:google-redirect-pending";

export function SignInPanel({
  allowedHostedDomain,
  initialError,
  localDemoEnabled,
  onSignedIn = openAppPage,
  returnTo,
}: Readonly<{
  allowedHostedDomain: string;
  initialError?: string | null;
  localDemoEnabled?: boolean;
  /** Opens the app after the session is established. Injectable for tests. */
  onSignedIn?: (href: string) => void;
  /** The in-app page the person was opening before sign-in. Validated again before use. */
  returnTo?: string | null;
}>) {
  const isConfigured = hasFirebaseBrowserConfig();
  const [status, setStatus] = useState<SignInStatus>(() =>
    isConfigured ? "checking" : "error",
  );
  const [notice, setNotice] = useState<SignInNotice | null>(() =>
    initialNotice(initialError, isConfigured),
  );
  const [linkCopy, setLinkCopy] = useState<"idle" | "copied" | "manual">("idle");
  const isCompletingSession = useRef(false);
  // The latest tap wins: an older Google window that is superseded must not change the page.
  const attemptRef = useRef(0);
  const interactiveRef = useRef(false);
  const onSignedInRef = useRef(onSignedIn);
  useEffect(() => {
    onSignedInRef.current = onSignedIn;
  }, [onSignedIn]);

  const destination = safeReturnPath(returnTo) ?? "/";
  const linkOperation = useOperation(destination);
  // Empty during server rendering and hydration, then the real value: the in-app advice below is
  // browser-specific and must not cause a hydration mismatch.
  const userAgent = useSyncExternalStore(subscribeToNothing, readUserAgent, () => "");
  const browser = detectSignInBrowser(userAgent, readMaxTouchPoints());

  const finishSignIn = useCallback(
    async (user: User, source: SignInSource) => {
      if (isCompletingSession.current) {
        return;
      }

      isCompletingSession.current = true;
      setStatus("creating");
      setNotice(null);

      try {
        const idToken = await user.getIdToken(true);
        const response = await fetch("/api/auth/session", {
          headers: {
            authorization: `Bearer ${idToken}`,
          },
          method: "POST",
        });

        if (!response.ok) {
          await signOut(getFirebaseClientAuth()).catch(() => undefined);
          isCompletingSession.current = false;
          interactiveRef.current = false;

          // A remembered sign-in that is too old for the server is not an error the person
          // caused. End it quietly and leave the ordinary control ready.
          if (response.status === 401 && source === "resumed") {
            setStatus("idle");
            setNotice({ tone: "status", text: SIGN_IN_COPY.resumedExpired });
            return;
          }

          setStatus("error");
          setNotice({ tone: "alert", text: sessionFailureMessage(response.status) });
          return;
        }

        // The session cookie is the whole sign-in. A browser that refuses it (cookies turned off,
        // some private modes) would otherwise bounce straight back to this page with no reason.
        const kept = await fetch("/api/auth/session", {
          cache: "no-store",
          method: "GET",
        }).catch(() => null);

        if (kept?.status === 401) {
          await signOut(getFirebaseClientAuth()).catch(() => undefined);
          isCompletingSession.current = false;
          interactiveRef.current = false;
          setStatus("error");
          setNotice({ tone: "alert", text: SIGN_IN_COPY.sessionNotKept });
          return;
        }

        clearRedirectPending();
        clearReturnPathInBrowser();
        onSignedInRef.current(destination);
      } catch (error) {
        isCompletingSession.current = false;
        interactiveRef.current = false;
        setStatus("error");
        setNotice({
          tone: "alert",
          text: signInFailureMessage(readAuthErrorCode(error), currentBrowser()),
        });
      }
    },
    [destination],
  );

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    let isMounted = true;
    const auth = getFirebaseClientAuth();
    const returningFromRedirect = readRedirectPending();

    // FB-HVSESSION-013: after a same-tab redirect returns, onAuthStateChanged below completes the
    // sign-in on its own. This call exists for the FAILURE case: a rejected hosted domain, a
    // cancelled redirect, or a redirect that returned without a sign-in resolves here and nowhere
    // else, so without it the person lands back on a silent sign-in page with no reason given.
    void getRedirectResult(auth)
      .then((result) => {
        if (!isMounted || !returningFromRedirect) return;
        clearRedirectPending();
        if (!result && !auth.currentUser && !isCompletingSession.current) {
          setStatus("error");
          setNotice({ tone: "alert", text: SIGN_IN_COPY.redirectIncomplete });
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        clearRedirectPending();
        setStatus("error");
        setNotice({
          tone: "alert",
          text: signInFailureMessage(readAuthErrorCode(error), currentBrowser()),
        });
      });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!isMounted) {
        return;
      }

      if (user) {
        void finishSignIn(
          user,
          returningFromRedirect || interactiveRef.current ? "interactive" : "resumed",
        );
        return;
      }

      setStatus((current) =>
        current === "checking" || current === "creating" ? "idle" : current,
      );
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [finishSignIn, isConfigured]);

  const handleSignIn = async () => {
    if (!isConfigured) {
      setStatus("error");
      setNotice({ tone: "alert", text: NOT_CONFIGURED_MESSAGE });
      return;
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      hd: allowedHostedDomain,
      prompt: "select_account",
    });

    const attempt = ++attemptRef.current;
    const tappedIn = currentBrowser();
    const redirectAvailable = firebaseRedirectSignInAvailable();
    interactiveRef.current = true;

    const startRedirect = async () => {
      try {
        setStatus("redirecting");
        setNotice({ tone: "status", text: SIGN_IN_COPY.openingInTab });
        markRedirectPending();
        await signInWithRedirect(getFirebaseClientAuth(), provider);
      } catch (redirectError) {
        clearRedirectPending();
        interactiveRef.current = false;
        setStatus("error");
        setNotice({
          tone: "alert",
          text: signInFailureMessage(readAuthErrorCode(redirectError), tappedIn),
        });
      }
    };

    // A same-tab redirect is the dependable path on a phone, but it can only return to the app
    // when the sign-in helper is served from this origin. Otherwise the Google window opened
    // straight from this tap is the path that works, on phones as on desktop.
    if (redirectAvailable && tappedIn.kind !== "desktop") {
      await startRedirect();
      return;
    }

    try {
      setStatus("opening");
      setNotice({ tone: "status", text: SIGN_IN_COPY.popupOpen });
      const result = await signInWithPopup(getFirebaseClientAuth(), provider);
      await finishSignIn(result.user, "interactive");
    } catch (error) {
      // A newer tap replaced this attempt. Its window and its outcome own the page now.
      if (attempt !== attemptRef.current) {
        return;
      }

      const code = readAuthErrorCode(error);

      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/user-cancelled"
      ) {
        interactiveRef.current = false;
        setStatus("idle");
        setNotice({ tone: "status", text: SIGN_IN_COPY.popupClosed });
        return;
      }

      // FB-HVSESSION-013: a browser that cannot open the Google window had no way forward. A
      // same-tab redirect needs no window, so use it when it can return here. When it cannot
      // (the helper is on another origin), say plainly what to do instead of starting a
      // redirect that ends on a provider error page. The credential step stays entirely with
      // the person either way; this changes how Google is reached, never who authenticates.
      if (
        code === "auth/popup-blocked" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        if (redirectAvailable) {
          await startRedirect();
          return;
        }

        interactiveRef.current = false;
        setStatus("error");
        setNotice({ tone: "alert", text: popupUnavailableMessage(tappedIn) });
        return;
      }

      interactiveRef.current = false;
      setStatus("error");
      setNotice({ tone: "alert", text: signInFailureMessage(code, tappedIn) });
    }
  };

  const handleLocalDemo = async () => {
    setStatus("creating");
    setNotice(null);

    const response = await fetch("/api/auth/demo", { method: "POST" });

    if (!response.ok) {
      setStatus("error");
      setNotice({ tone: "alert", text: SIGN_IN_COPY.sessionUnavailable });
      return;
    }

    clearReturnPathInBrowser();
    onSignedInRef.current(destination);
  };

  const handleCopyLink = async () => {
    if (linkOperation.snapshot.phase === "pending") return;
    setLinkCopy("idle");
    const outcome = await linkOperation.controller.run(
      "Copying page link",
      () => boundedLocalWait(navigator.clipboard.writeText(pageLink(destination))),
      { waitMs: 8_000 },
    );
    if (outcome.outcome === "superseded") return;
    // No confirmed clipboard result: retain a selectable address for manual copying.
    setLinkCopy(outcome.outcome === "succeeded" ? "copied" : "manual");
  };

  // The control stays available while the Google window is open: on a phone that window is a
  // separate tab, and a person who comes back without finishing needs a way to start again.
  const isBusy =
    status === "checking" || status === "redirecting" || status === "creating";

  return (
    <div className="auth-actions">
      {browser.kind === "in_app" ? (
        <div className="auth-browser-note" role="note">
          <p>
            <strong>Open this page in {deviceBrowserName(browser.platform)}.</strong> You
            are viewing it inside another app, where Google sign-in often cannot finish.
          </p>
          <p className="muted">
            Use this app&rsquo;s menu to open the page in your browser, or copy the link
            and paste it there.
          </p>
          <button
            className="secondary-button"
            disabled={linkOperation.snapshot.phase === "pending"}
            onClick={handleCopyLink}
            type="button"
          >
            {linkOperation.snapshot.phase === "pending"
              ? "Copying page link…"
              : "Copy page link"}
          </button>
          {linkOperation.snapshot.phase === "pending" ? (
            <BusyIndicator label="Copying page link" />
          ) : null}
          {linkCopy === "copied" && linkOperation.snapshot.phase === "succeeded" ? (
            <p className="muted" role="status">
              Link copied.
            </p>
          ) : null}
          {linkCopy === "manual" ? (
            <label className="auth-link-field">
              Page link
              <input
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={pageLink(destination)}
              />
            </label>
          ) : null}
        </div>
      ) : null}
      <button
        className="primary-button primary-button--accent"
        disabled={isBusy}
        onClick={handleSignIn}
        type="button"
      >
        {buttonLabel(status)}
      </button>
      {localDemoEnabled ? (
        <button
          className="secondary-button"
          disabled={isBusy}
          onClick={handleLocalDemo}
          type="button"
        >
          Continue in local demo mode
        </button>
      ) : null}
      <p className="muted">Use a {allowedHostedDomain} Google Workspace account.</p>
      {notice ? (
        <p className="auth-message" role={notice.tone}>
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}

function openAppPage(href: string) {
  window.location.assign(href);
}

function sessionFailureMessage(status: number) {
  // A 403 means the account is authenticated with Google but not authorized for the internal app;
  // show the same friendly copy the page-guard forbidden redirect uses, not the raw server string.
  if (status === 403) {
    return UNAUTHORIZED_ACCOUNT_MESSAGE;
  }

  if (status === 401) {
    return SIGN_IN_COPY.sessionRejected;
  }

  return SIGN_IN_COPY.sessionUnavailable;
}

function buttonLabel(status: SignInStatus) {
  if (status === "checking") {
    return "Checking session...";
  }

  if (status === "redirecting") {
    return "Opening Google...";
  }

  if (status === "creating") {
    return "Signing in...";
  }

  return "Sign in with Google";
}

function initialNotice(
  initialError: string | null | undefined,
  isConfigured: boolean,
): SignInNotice | null {
  if (initialError === "forbidden") {
    return { tone: "alert", text: UNAUTHORIZED_ACCOUNT_MESSAGE };
  }

  if (!isConfigured) {
    return { tone: "alert", text: NOT_CONFIGURED_MESSAGE };
  }

  return null;
}

function subscribeToNothing() {
  return () => {};
}

function readUserAgent() {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}

function readMaxTouchPoints() {
  return typeof navigator === "undefined" ? 0 : (navigator.maxTouchPoints ?? 0);
}

function currentBrowser(): SignInBrowser {
  return detectSignInBrowser(readUserAgent(), readMaxTouchPoints());
}

function pageLink(destination: string) {
  return `${window.location.origin}${destination}`;
}

function readRedirectPending() {
  try {
    return window.sessionStorage.getItem(REDIRECT_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function markRedirectPending() {
  try {
    window.sessionStorage.setItem(REDIRECT_PENDING_KEY, "1");
  } catch {
    // Without session storage the return is simply handled as an ordinary page load.
  }
}

function clearRedirectPending() {
  try {
    window.sessionStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {
    // Nothing to clear.
  }
}
