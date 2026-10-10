"use client";
import type { ReactNode } from "react";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { RenewalPricingPolicyProvider } from "./RenewalPricingPolicy";
/** The working-record hook belongs inside the client provider, below its owning context. */
export function RenewalPricingForLease({
  leaseId,
  canEdit,
  live,
  children,
}: Readonly<{ leaseId: string; canEdit: boolean; live: boolean; children: ReactNode }>) {
  const working = useRenewalWorkingRecord();
  return live && /^[1-9]\d*$/.test(leaseId) ? (
    <RenewalPricingPolicyProvider
      leaseId={leaseId}
      canEdit={canEdit}
      workingRevision={working?.record?.revision ?? 0}
    >
      {children}
    </RenewalPricingPolicyProvider>
  ) : (
    <>{children}</>
  );
}
