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
        const errorMessage = await readErrorMessage(response);
        await signOut(getFirebaseClientAuth()).catch(() => undefined);
        isCompletingSession.current = false;
        setStatus("error");
        setMessage(errorMessage);
        return;
      }

      window.location.assign("/ask");
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

    window.location.assign("/ask");
  };

  const isBusy =
    status === "checking" || status === "redirecting" || status === "creating";

  return (
    <div className="auth-actions">
      <button
        className="primary-button"
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
    return "This Google account is not authorized for PMI KC KB.";
  }

  if (!isConfigured) {
    return "Firebase sign-in is not configured for this environment.";
  }

  return null;
}
