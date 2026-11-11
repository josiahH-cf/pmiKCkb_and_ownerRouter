"use client";

// S270 R-S270-1 / R-S269-3: Finish up's active follow-up in Work, then "Other follow-ups". Both
// parts read the one lead (useFinishUpLead), which stays while the person works on it. The lead is
// a client hook, so this wrapper is a client component; the server workspace passes its children.

import type { ReactNode } from "react";

import { GUIDED_SECONDARY_WORK_LABELS } from "@/lib/lease-renewal/guided-priority";
import { RenewalSecondaryWork } from "./RenewalGuidedView";
import { RenewalManualSection, useFinishUpLead } from "./RenewalManualWorkspace";

export function FinishUpFollowUps({
  children,
  currentRent,
  moveOutInitiated,
}: Readonly<{
  children: ReactNode;
  currentRent?: number | null;
  moveOutInitiated: boolean;
}>) {
  const lead = useFinishUpLead();
  return (
    <>
      <RenewalManualSection
        section="documents"
        documentOutcome="finish-up"
        moveOutInitiated={moveOutInitiated}
        currentRent={currentRent}
        part="lead"
        leadActivity={lead}
      />
      {children}
      <RenewalSecondaryWork
        label={GUIDED_SECONDARY_WORK_LABELS["finish-up"]!}
        stepId="finish-up"
      >
        <RenewalManualSection
          section="documents"
          documentOutcome="finish-up"
          moveOutInitiated={moveOutInitiated}
          currentRent={currentRent}
          part="rest"
          leadActivity={lead}
        />
      </RenewalSecondaryWork>
    </>
  );
}
