"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseClientAuth, hasFirebaseBrowserConfig } from "@/lib/firebase/client";

type SignInStatus = "checking" | "idle" | "redirecting" | "creating" | "error";

// Shown when the server rejects the session because the account is not authorized for the internal app
// (wrong hosted domain, unverified email, vendor identity, etc.). A 403 from POST /api/auth/session and
// the page-guard `?error=forbidden` redirect both surface this same friendly copy, so the sign-in popup
// path and the deep-link-guard path stay consistent instead of leaking the raw server error string.
const UNAUTHORIZED_ACCOUNT_MESSAGE =
  "This Google account is not authorized for PMI KC KB.";

export function SignInPanel({
  allowedHostedDomain,
  initialError,
  localDemoEnabled,
}: Readonly<{
  allowedHostedDomain: string;
  initialError?: string | null;
  localDemoEnabled?: boolean;
}>) {
  const isConfigured = hasFirebaseBrowserConfig();
  const [status, setStatus] = useState<SignInStatus>(() =>
    isConfigured ? "checking" : "error",
  );
  const [message, setMessage] = useState<string | null>(() =>
    initialMessage(initialError, isConfigured),
  );
  const isCompletingSession = useRef(false);

  const finishSignIn = useCallback(async (user: User) => {
    if (isCompletingSession.current) {
      return;
    }

    isCompletingSession.current = true;
    setStatus("creating");
    setMessage(null);

    try {
      const idToken = await user.getIdToken(true);
      const response = await fetch("/api/auth/session", {
        headers: {
          authorization: `Bearer ${idToken}`,
        },
        method: "POST",
      });

      if (!response.ok) {
        // A 403 means the account is authenticated with Google but not authorized for the internal app;
        // show the same friendly copy the page-guard forbidden redirect uses, not the raw server string.
        const errorMessage =
          response.status === 403
            ? UNAUTHORIZED_ACCOUNT_MESSAGE
            : await readErrorMessage(response);
        await signOut(getFirebaseClientAuth()).catch(() => undefined);
        isCompletingSession.current = false;
        setStatus("error");
        setMessage(errorMessage);
        return;
      }

      window.location.assign("/");
    } catch (error) {
      isCompletingSession.current = false;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Google sign-in failed.");
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    let isMounted = true;
    const auth = getFirebaseClientAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!isMounted) {
        return;
      }

      if (user) {
        void finishSignIn(user);
        return;
      }

      setStatus("idle");
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [finishSignIn, isConfigured]);

  const handleSignIn = async () => {
    if (!isConfigured) {
      setStatus("error");
      setMessage("Firebase sign-in is not configured for this environment.");
      return;
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      hd: allowedHostedDomain,
      prompt: "select_account",
    });

    try {
      setStatus("redirecting");
      setMessage(null);
      const auth = getFirebaseClientAuth();
      const result = await signInWithPopup(auth, provider);
      await finishSignIn(result.user);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";

      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        setStatus("idle");
        setMessage(null);
        return;
      }

      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Google sign-in failed.");
    }
  };

  const handleLocalDemo = async () => {
    setStatus("creating");
    setMessage(null);

    const response = await fetch("/api/auth/demo", { method: "POST" });

    if (!response.ok) {
      const errorMessage = await readErrorMessage(response);
      setStatus("error");
      setMessage(errorMessage);
      return;
    }

    window.location.assign("/");
  };

  const isBusy =
    status === "checking" || status === "redirecting" || status === "creating";

  return (
    <div className="auth-actions">
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
      {message ? (
        <p className="auth-message" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

async function readErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;

  if (typeof payload?.error === "string" && payload.error.trim().length > 0) {
    return payload.error;
  }

  return "Google sign-in was rejected.";
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

function initialMessage(initialError: string | null | undefined, isConfigured: boolean) {
  if (initialError === "forbidden") {
    return UNAUTHORIZED_ACCOUNT_MESSAGE;
  }

  if (!isConfigured) {
    return "Firebase sign-in is not configured for this environment.";
  }

  return null;
}
