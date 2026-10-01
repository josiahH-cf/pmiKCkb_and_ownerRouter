"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";
import { useRenewalFocusView } from "./RenewalFocusViewContext";
import {
  RENEWAL_NEXT_ACTION_TARGET_ID,
  type RenewalIssueProjection,
} from "@/lib/lease-renewal/renewal-issues";

interface SaveReadback {
  /** Additional authoritative version fence for the shared manual workspace. */
  manual?: { cycleId: string; revision: number };
}
const Context = createContext<((readback?: SaveReadback) => true) | null>(null);
export function useRenewalSaveFocus() {
  return useContext(Context);
}

/** Successful app saves request one refresh; ordinary reads never request focus. */
export function RenewalSaveFocus({
  leaseId,
  cycleId,
  revision,
  readable,
  projection,
  targetId,
  children,
}: {
  leaseId: string;
  cycleId: string | null;
  revision: number | null;
  readable: boolean;
  projection: RenewalIssueProjection;
  targetId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  // S144: while the Focus view is shown it owns focus and advances on the recomputed projection.
  const focusView = useRenewalFocusView()?.view === "focus";
  const [refreshing, startRefresh] = useTransition();
  const [saved, setSaved] = useState<{
    leaseId: string;
    before: RenewalIssueProjection;
    readback: SaveReadback;
  } | null>(null);
  const consumed = useRef<typeof saved>(null);
  useEffect(() => {
    if (!saved || consumed.current === saved) return;
    if (saved.leaseId !== leaseId) {
      consumed.current = saved;
      return;
    }
    if (refreshing) return;
    if (saved.before === projection) {
      // A failed/cancelled refresh can finish without delivering props. Do not let a later
      // unrelated reload revive that completed save's focus intent.
      consumed.current = saved;
      return;
    }
    // An unavailable refreshed read never means all issues resolved or queues later focus.
    if (!readable) {
      consumed.current = saved;
      return;
    }
    const expected = saved.readback.manual;
    if (
      expected &&
      (cycleId !== expected.cycleId || revision === null || revision < expected.revision)
    ) {
      // A completed stale refresh must not steal focus on a later unrelated reload.
      consumed.current = saved;
      return;
    }
    consumed.current = saved;
    if (focusView) return;
    if (
      !focusRenewalDashboardControl(targetId, {
        allowButtons: false,
        focusContainer: targetId === RENEWAL_NEXT_ACTION_TARGET_ID,
      })
    )
      focusRenewalDashboardControl(RENEWAL_NEXT_ACTION_TARGET_ID, {
        allowButtons: false,
        focusContainer: true,
      });
  }, [
    saved,
    leaseId,
    cycleId,
    revision,
    readable,
    projection,
    refreshing,
    targetId,
    focusView,
  ]);
  return (
    <Context.Provider
      value={(readback = {}) => {
        setSaved({ leaseId, before: projection, readback });
        startRefresh(() => router.refresh());
        return true;
      }}
    >
      {children}
    </Context.Provider>
  );
}
