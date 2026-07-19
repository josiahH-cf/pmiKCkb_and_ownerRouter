"use client";

// Session idle timeout (NOTIF-6, §P). After ~30 minutes with no activity the user is signed out;
// at 28 minutes a warning appears with a live 2-minute countdown and a "Stay signed in" action that
// resets the timer. Passive activity resets the idle clock BEFORE the warning; once the warning is
// showing, only the explicit button resets it, so the countdown is a deliberate prompt. Thresholds
// and the sign-out action are injectable for testing. Renders nothing until the warning is due.

import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { getFirebaseClientAuth, hasFirebaseBrowserConfig } from "@/lib/firebase/client";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
] as const;

const WARN_AFTER_MS = 28 * 60_000;
const LOGOUT_AFTER_MS = 30 * 60_000;

async function defaultTimeoutSignOut() {
  if (hasFirebaseBrowserConfig()) {
    await signOut(getFirebaseClientAuth()).catch(() => undefined);
  }
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
  window.location.assign("/sign-in");
}

export function SessionTimeout({
  warnAfterMs = WARN_AFTER_MS,
  logoutAfterMs = LOGOUT_AFTER_MS,
  onTimeout = defaultTimeoutSignOut,
}: Readonly<{
  warnAfterMs?: number;
  logoutAfterMs?: number;
  onTimeout?: () => void | Promise<void>;
}>) {
  const lastActivityRef = useRef(0);
  const warnedRef = useRef(false);
  const timedOutRef = useRef(false);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Keep the latest onTimeout in a ref so the interval effect never depends on its identity: an
  // inline onTimeout={() => ...} would otherwise re-create the effect (re-seeding the idle clock)
  // on every render, which during the countdown would reset idle each second and never log out.
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  function stayActive() {
    lastActivityRef.current = Date.now();
    warnedRef.current = false;
    timedOutRef.current = false;
    setRemainingSeconds(null);
  }

  useEffect(() => {
    // Seed the idle clock on mount (Date.now() must not be called during render).
    lastActivityRef.current = Date.now();
    // Passive activity resets the idle clock only while the warning is not showing (and never after
    // timeout), so the warned state is dismissed exclusively by the explicit "Stay signed in" button.
    const onActivity = () => {
      if (timedOutRef.current || warnedRef.current) return;
      lastActivityRef.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    );

    const tick = setInterval(() => {
      if (timedOutRef.current) return;
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= logoutAfterMs) {
        timedOutRef.current = true;
        warnedRef.current = false;
        setRemainingSeconds(null);
        void Promise.resolve(onTimeoutRef.current()).catch(() => undefined);
      } else if (idle >= warnAfterMs) {
        warnedRef.current = true;
        setRemainingSeconds(Math.max(0, Math.ceil((logoutAfterMs - idle) / 1000)));
      } else {
        warnedRef.current = false;
        // No-op when already clear, so the background tick never re-renders in the common case.
        setRemainingSeconds((prev) => (prev === null ? prev : null));
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      clearInterval(tick);
    };
  }, [warnAfterMs, logoutAfterMs]);

  const isWarning = remainingSeconds !== null;
  useEffect(() => {
    if (isWarning) stayButtonRef.current?.focus();
  }, [isWarning]);

  if (remainingSeconds === null) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  // Modal focus trap: the "Stay signed in" button is the only focusable, so Tab keeps focus on it.
  function keepFocusInDialog(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      stayButtonRef.current?.focus();
    }
  }

  return (
    <div className="ui-dialog-backdrop">
      <div
        aria-describedby="session-timeout-desc"
        aria-labelledby="session-timeout-title"
        aria-modal="true"
        className="panel session-timeout-dialog"
        onKeyDown={keepFocusInDialog}
        role="alertdialog"
      >
        <h2 id="session-timeout-title">Are you still active?</h2>
        <p id="session-timeout-desc">
          We&rsquo;ll sign you out soon to keep your account secure. Signing out in{" "}
          {minutes}:{seconds}.
        </p>
        <button
          ref={stayButtonRef}
          className="primary-button button--large"
          onClick={stayActive}
          type="button"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
