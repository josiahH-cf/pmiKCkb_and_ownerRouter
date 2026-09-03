"use client";

import {
  createContext,
  useContext,
  useState,
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
  const pending = pendingForState === stateKey;

  const handleSubmit: FormEventHandler<HTMLFormElement> = () => {
    setPendingForState(stateKey);
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
