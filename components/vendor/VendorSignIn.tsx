"use client";

import { useRef, useState } from "react";
import {
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  multiFactor,
  signInWithEmailAndPassword,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from "firebase/auth";

import { getFirebaseClientAuth, hasFirebaseBrowserConfig } from "@/lib/firebase/client";

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
      setMessage(error instanceof Error ? error.message : "Vendor sign-in failed.");
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
        await finish(enrollment.current.user);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The TOTP code was rejected.");
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
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              required
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
        There is no self-registration. Use the one-time setup link from PMI KC first.
      </p>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
