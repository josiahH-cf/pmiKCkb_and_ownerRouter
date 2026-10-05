"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type FormEventHandler,
  type ReactNode,
} from "react";

import { RENEWAL_DESK_ROUTE } from "@/lib/lease-renewal/desk-view-continuation";

const PendingContext = createContext(false);

/**
 * A progressively enhanced GET form. Native navigation remains the source of truth; this wrapper
 * only exposes the short interval between submit and the next server render to assistive technology
 * and prevents accidental repeat submissions.
 */
export function RenewalDeskGetForm({
  children,
  className,
  pendingLabel,
  stateKey,
}: Readonly<{
  children: ReactNode;
  className: string;
  pendingLabel: string;
  /** Canonical current view; a completed navigation resets pending state even if React reuses it. */
  stateKey: string;
}>) {
  const [pendingForState, setPendingForState] = useState<string | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = pendingForState === stateKey;
  useEffect(() => {
    const settle = () => {
      if (timer.current) clearTimeout(timer.current);
      setPendingForState(null);
    };
    window.addEventListener("pmi:desk-view-settled", settle);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("pmi:desk-view-settled", settle);
    };
  }, []);

  const handleSubmit: FormEventHandler<HTMLFormElement> = () => {
    setPendingForState(stateKey);
    setError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPendingForState(null);
      setError(
        "The requested view has not finished opening. The previous view remains available; retry when ready.",
      );
    }, 30_000);
  };

  return (
    <PendingContext.Provider value={pending}>
      <form
        action={RENEWAL_DESK_ROUTE}
        aria-busy={pending}
        className={className}
        method="get"
        onSubmit={handleSubmit}
      >
        {children}
        {error ? (
          <span className="error-text" role="alert">
            {error}
          </span>
        ) : null}
        <span aria-live="polite" className="sr-only" role="status">
          {pending ? pendingLabel : ""}
        </span>
      </form>
    </PendingContext.Provider>
  );
}

export function RenewalDeskSubmitButton({
  children,
  className,
  pendingText,
}: Readonly<{
  children: ReactNode;
  className: string;
  pendingText: string;
}>) {
  const pending = useContext(PendingContext);
  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? pendingText : children}
    </button>
  );
}
