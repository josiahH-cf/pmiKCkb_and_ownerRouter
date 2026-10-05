"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

// Session idle timeout (NOTIF-6, §P). After ~30 minutes with no activity the user is signed out;
// at 28 minutes a warning appears with a live 2-minute countdown and a "Stay signed in" action that
// resets the timer. Passive activity resets the idle clock BEFORE the warning; once the warning is
// showing, only the explicit button resets it, so the countdown is a deliberate prompt. Thresholds
// and the sign-out action are injectable for testing. Renders nothing until the warning is due.
//
// S165: the session cookie is shared by every tab, so the idle clock is shared too. Each tab
// records the time of its latest activity in local storage (a timestamp only) and every tab reads
// it, so a tab that was in the background or suspended by a phone does not sign out a session the
// person is actively using in another tab. A person who is idle everywhere is still signed out.

import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { rememberReturnPathInBrowser } from "@/lib/auth/return-to";
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

export const SHARED_ACTIVITY_KEY = "pmi-kc:last-activity";
// Passive activity fires many times a second; the shared record only needs to be this fresh.
const SHARED_ACTIVITY_WRITE_INTERVAL_MS = 5_000;

/** The latest activity recorded by any tab, or 0 when none is readable. A time in the future is ignored. */
function readSharedActivity(now: number) {
  try {
    const value = Number(window.localStorage.getItem(SHARED_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 && value <= now + 1_000 ? value : 0;
  } catch {
    return 0;
  }
}

function writeSharedActivity(at: number) {
  try {
    window.localStorage.setItem(SHARED_ACTIVITY_KEY, String(at));
  } catch {
    // Without local storage each tab keeps its own idle clock, as before.
  }
}

async function defaultTimeoutSignOut() {
  // S165: come back to this page after signing in again.
  rememberReturnPathInBrowser(`${window.location.pathname}${window.location.search}`);
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
  const lastSharedWriteRef = useRef(0);
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
    lastSharedWriteRef.current = lastActivityRef.current;
    writeSharedActivity(lastActivityRef.current);
    warnedRef.current = false;
    timedOutRef.current = false;
    setRemainingSeconds(null);
  }

  useEffect(() => {
    // Seed the idle clock on mount (Date.now() must not be called during render).
    lastActivityRef.current = Date.now();
    lastSharedWriteRef.current = lastActivityRef.current;
    writeSharedActivity(lastActivityRef.current);
    // Passive activity resets the idle clock only while the warning is not showing (and never after
    // timeout), so the warned state is dismissed exclusively by the explicit "Stay signed in" button.
    const onActivity = () => {
      if (timedOutRef.current || warnedRef.current) return;
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastSharedWriteRef.current >= SHARED_ACTIVITY_WRITE_INTERVAL_MS) {
        lastSharedWriteRef.current = now;
        writeSharedActivity(now);
      }
    };
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    );

    const tick = setInterval(() => {
      if (timedOutRef.current) return;
      const now = Date.now();
      // Activity in any tab counts: this tab may have been in the background or suspended.
      const idle = now - Math.max(lastActivityRef.current, readSharedActivity(now));
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
