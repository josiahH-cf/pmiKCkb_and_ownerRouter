"use client";

import { createContext, useContext, type ReactNode } from "react";

import type {
  PolicyFact,
  PolicyMaterialSnapshot,
} from "@/lib/lease-renewal/policy-content";

/**
 * S131 (F11): the page-read policy inputs shared by the workspace panel and the message readiness,
 * so both project applicability from the same material snapshot, legacy Sheet evidence and
 * verified facts. Absent (null) on surfaces that did not read them; nothing is assumed then.
 */
export interface RenewalPolicyContextValue {
  readonly leaseId: string;
  readonly material: PolicyMaterialSnapshot;
  /** The legacy operating-Sheet column text for this lease, or null when the row was not read. */
  readonly sheetLegacyValue: string | null;
  /** Verified facts the approved rule and slots may consume; none are read yet (F10 supplies mappings). */
  readonly facts: readonly PolicyFact[];
  readonly todayIso: string;
}

const Context = createContext<RenewalPolicyContextValue | null>(null);

export function RenewalPolicyProvider({
  value,
  children,
}: {
  value: RenewalPolicyContextValue | null;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRenewalPolicy() {
  return useContext(Context);
}
