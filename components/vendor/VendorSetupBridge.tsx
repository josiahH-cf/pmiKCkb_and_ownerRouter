"use client";

import { useEffect, useRef, useState } from "react";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function VendorSetupBridge() {
  const tokenRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<"checking" | "ready" | "submitting" | "invalid">(
    "checking",
  );

  useEffect(() => {
    // React development checks may re-run this effect after the fragment has already been cleared.
    // Preserve the in-memory credential without reading it into render state.
    if (tokenRef.current) {
      queueMicrotask(() => setPhase("ready"));
      return;
    }
    const fragment = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const fields = new URLSearchParams(fragment);
    const entries = [...fields.entries()];

    // Replace the fragment-bearing history entry before doing anything that can create an HTTP
    // request. The raw token never enters a request URL, a referrer, React state, or an app log.
    try {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    } catch {
      // Do not submit if the browser cannot first remove the token-bearing fragment.
      queueMicrotask(() => setPhase("invalid"));
      return;
    }

    if (
      entries.length !== 1 ||
      entries[0]?.[0] !== "token" ||
      !TOKEN_PATTERN.test(entries[0]?.[1] ?? "")
    ) {
      queueMicrotask(() => setPhase("invalid"));
      return;
    }

    tokenRef.current = entries[0][1];
    queueMicrotask(() => setPhase("ready"));
  }, []);

  function continueSetup() {
    const rawToken = tokenRef.current;
    if (!rawToken || phase !== "ready") {
      setPhase("invalid");
      return;
    }
    setPhase("submitting");
    const form = document.createElement("form");
    const token = document.createElement("input");
    form.method = "post";
    form.action = "/api/vendor/setup";
    form.enctype = "application/x-www-form-urlencoded";
    form.hidden = true;
    token.type = "hidden";
    token.name = "token";
    token.value = rawToken;
    form.append(token);
    document.body.append(form);
    try {
      // A browser-navigation POST lets the server's 303 proceed directly to Firebase Auth without
      // exposing its Location header to JavaScript or relying on CORS/fetch redirect behavior.
      form.submit();
    } catch {
      setPhase("invalid");
    } finally {
      // The browser's submit algorithm has already constructed the form entry list before returning.
      // Remove the transient raw token from the DOM even if navigation is delayed or refused.
      tokenRef.current = null;
      token.value = "";
      form.remove();
    }
  }

  return (
    <main className="content auth-shell">
      <section className="card" aria-live="polite">
        <h1>
          {phase === "invalid"
            ? "Setup link unavailable"
            : phase === "ready"
              ? "Secure Vendor setup"
              : "Opening secure Vendor setup"}
        </h1>
        <p>
          {phase === "invalid"
            ? "If your account is still pending setup, ask your PMI KC contact to request a setup-link reissue. Active or disabled accounts require Admin review under the separately governed account-reset lifecycle."
            : phase === "ready"
              ? "Continue when you are ready to verify this one-time link."
              : "Please wait while we prepare secure setup."}
        </p>
        {phase === "ready" ? (
          <button className="btn" type="button" onClick={continueSetup}>
            Continue to secure setup
          </button>
        ) : null}
      </section>
    </main>
  );
}
