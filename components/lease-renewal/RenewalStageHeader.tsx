"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import type { CycleDisposition } from "@/lib/lease-renewal/cycle-disposition";
import { formatBusinessTimestamp } from "@/lib/date-display";
import { RenewalCycleDispositionAction } from "./RenewalCycleDispositionAction";
import type { RenewalStage } from "@/lib/lease-renewal/renewal-stage";
import { MANUAL_ACTIVITIES } from "@/lib/lease-renewal/workspace-state";
import {
  focusProgrammatically,
  focusRenewalDashboardControl,
} from "./RenewalDashboardNavigation";

const activities = [
  ...Object.entries(MANUAL_ACTIVITIES).map(([event, definition]) => ({
    label: definition.label,
    target: `renewal-manual-${event}`,
  })),
  { label: "Owner decision", target: "renewal-manual-owner_response" },
  { label: "Tenant response", target: "renewal-manual-tenant_response" },
  { label: "Staff completion", target: "renewal-manual-complete" },
];

/** The shared stage stays above the path while the person opens an actual work record. */
export function RenewalStageHeader({
  canEdit,
  disposition,
  leaseId,
  stage,
}: Readonly<{
  canEdit: boolean;
  disposition?: CycleDisposition;
  leaseId: string;
  stage: RenewalStage;
}>) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const choices = useRef<HTMLDivElement>(null);
  const id = useId();
  const targets = new Set(
    stage.steps
      .filter((step) => step.state !== "not_part")
      .flatMap((step) => step.controls),
  );
  const available = activities.filter(({ target }) => targets.has(target));
  // The containing section owns the existing actual form, even if its step needs to be opened.
  // The list is presentational. Opening or choosing from it never saves a work record.
  useEffect(() => {
    if (open) choices.current?.querySelector("button")?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    if (trigger.current) focusProgrammatically(trigger.current);
  }

  return (
    <section
      aria-label="Current renewal stage"
      className="ui-stack-tight"
      data-renewal-stage-header
      id="renewal-current-stage"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (open && event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          close();
        }
      }}
    >
      <div className="ui-row">
        <p
          className="renewal-guided-stage"
          data-renewal-field="stage-line"
          data-renewal-stage={stage.stage.key}
          data-renewal-current-step={stage.currentStepId}
        >
          {stage.stageLine}
        </p>
        <Button
          aria-controls={id}
          aria-expanded={open}
          disabled={!canEdit || (available.length === 0 && !disposition)}
          id="renewal-record-work"
          onClick={() => (open ? close() : setOpen(true))}
          ref={trigger}
          size="compact"
          variant="secondary"
        >
          Record work
        </Button>
      </div>
      {disposition?.state === "retired" && disposition.record ? (
        <p className="muted">
          {disposition.record.reason} · Recorded by {disposition.record.actorUid} on{" "}
          {formatBusinessTimestamp(disposition.record.at)}.
        </p>
      ) : null}
      {stage.check || stage.handStatusLine ? (
        <details>
          <summary>Needs a check</summary>
          {stage.check ? <p>{stage.check.sentence}</p> : null}
          {stage.handStatusLine ? <p>{stage.handStatusLine}</p> : null}
        </details>
      ) : null}
      <div
        aria-label="Choose work to record"
        hidden={!open || !canEdit}
        id={id}
        ref={choices}
      >
        <div className="ui-row">
          {available.map(({ label, target }) => (
            <Button
              key={target}
              onClick={() => {
                close();
                focusRenewalDashboardControl(target);
              }}
              size="compact"
              variant="secondary"
            >
              {label}
            </Button>
          ))}
          {disposition ? (
            <RenewalCycleDispositionAction disposition={disposition} leaseId={leaseId} />
          ) : null}
          <Button onClick={close} size="compact" variant="tertiary">
            Cancel
          </Button>
        </div>
      </div>
    </section>
  );
}
