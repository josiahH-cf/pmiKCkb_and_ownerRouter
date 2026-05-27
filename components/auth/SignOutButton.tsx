"use client";

import { useState } from "react";
import { signOut } from "firebase/auth";
import { getFirebaseClientAuth, hasFirebaseBrowserConfig } from "@/lib/firebase/client";

export function SignOutButton() {
  const [isPending, setIsPending] = useState(false);

  const handleSignOut = async () => {
    setIsPending(true);

    if (hasFirebaseBrowserConfig()) {
      await signOut(getFirebaseClientAuth()).catch(() => undefined);
    }

    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
    window.location.assign("/sign-in");
  };

  return (
    <button
      className="nav-button"
      disabled={isPending}
      onClick={handleSignOut}
      type="button"
    >
      {isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
