"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { useRef, useState } from "react";
import {
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  multiFactor,
  signOut,
  signInWithEmailAndPassword,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from "firebase/auth";

import { getFirebaseClientAuth, hasFirebaseBrowserConfig } from "@/lib/firebase/client";

// S165: plain, actionable copy for a failed Vendor sign-in. The sign-in provider's own error text
// names internal codes a person cannot act on, so it is never shown. A message written by this app
// or its server (an error without a provider code) is shown as written.
function vendorSignInFailureMessage(error: unknown, fallback: string) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-email":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "That email and password did not match a Vendor account. Check both, then try again.";
    case "auth/invalid-verification-code":
    case "auth/code-expired":
      return "That code did not match. Enter the current six-digit code from your authenticator app.";
    case "auth/too-many-requests":
      return "Sign-in is paused after several attempts. Wait a few minutes, then try again.";
    case "auth/network-request-failed":
      return "Sign-in could not connect. Check your connection, then try again.";
    case "auth/user-disabled":
      return "This Vendor account is turned off. Contact PMI KC for help.";
    case "":
      return error instanceof Error && error.message ? error.message : fallback;
    default:
      return fallback;
  }
}

export function VendorSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [mode, setMode] = useState<"credentials" | "challenge" | "enroll">("credentials");
  const resolver = useRef<MultiFactorResolver | null>(null);
  const enrollment = useRef<{ user: User; secret: TotpSecret } | null>(null);

  async function finish(user: User) {
    const idToken = await user.getIdToken(true);
    const response = await fetch("/api/vendor/auth/session", {
      method: "POST",
      headers: { authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error ?? "Vendor sign-in was rejected.");
    }
    window.location.assign("/vendor");
  }

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!hasFirebaseBrowserConfig()) {
      setMessage("Vendor Firebase sign-in is not configured in this environment.");
      return;
    }
    const auth = getFirebaseClientAuth();
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (multiFactor(result.user).enrolledFactors.length === 0) {
        const session = await multiFactor(result.user).getSession();
        const secret = await TotpMultiFactorGenerator.generateSecret(session);
        enrollment.current = { user: result.user, secret };
        setSetupKey(secret.secretKey);
        setMode("enroll");
        setMessage(
          "Add the setup key to an authenticator app, then enter its six-digit code.",
        );
        return;
      }
      await finish(result.user);
    } catch (error) {
      const codeValue =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (codeValue === "auth/multi-factor-auth-required") {
        resolver.current = getMultiFactorResolver(auth, error as never);
        setMode("challenge");
        setMessage("Enter the six-digit code from your authenticator app.");
        return;
      }
      setMessage(
        vendorSignInFailureMessage(
          error,
          "Vendor sign-in did not finish. Check your details, then try again.",
        ),
      );
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      if (mode === "challenge" && resolver.current) {
        const hint = resolver.current.hints.find(
          (candidate) => candidate.factorId === TotpMultiFactorGenerator.FACTOR_ID,
        );
        if (!hint) throw new Error("No enrolled TOTP factor is available.");
        const assertion = TotpMultiFactorGenerator.assertionForSignIn(
          hint.uid,
          code.trim(),
        );
        await finish((await resolver.current.resolveSignIn(assertion)).user);
        return;
      }
      if (mode === "enroll" && enrollment.current) {
        const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
          enrollment.current.secret,
          code.trim(),
        );
        await multiFactor(enrollment.current.user).enroll(assertion, "Authenticator app");
        // Enrollment proves possession for registration, but the current Firebase sign-in
        // did not itself use TOTP. Sign out and require a fresh password + TOTP challenge so
        // the server receives firebase.sign_in_second_factor=totp before issuing a session.
        await signOut(getFirebaseClientAuth());
        enrollment.current = null;
        setMode("credentials");
        setPassword("");
        setCode("");
        setSetupKey("");
        setMessage(
          "TOTP enrolled. Sign in again and complete the authenticator challenge.",
        );
      }
    } catch (error) {
      setMessage(
        vendorSignInFailureMessage(
          error,
          "That code was not accepted. Enter the current six-digit code, then try again.",
        ),
      );
    }
  }

  return (
    <div className="panel auth-actions">
      <h1>Vendor sign in</h1>
      {mode === "credentials" ? (
        <form onSubmit={submitCredentials}>
          <label>
            Verified Vendor email
            <input
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              spellCheck={false}
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className="primary-button" type="submit">
            Continue
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          {mode === "enroll" && setupKey ? (
            <p className="mono">Setup key: {setupKey}</p>
          ) : null}
          <label>
            Authenticator code
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              onChange={(event) => setCode(event.target.value)}
              pattern="[0-9]{6}"
              required
              value={code}
            />
          </label>
          <button className="primary-button" type="submit">
            Verify
          </button>
        </form>
      )}
      <p className="muted">
        Start from the one-time setup link PMI KC sends you; your account is created
        there.
      </p>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
