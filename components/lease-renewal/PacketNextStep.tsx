"use client";

// S268 (R-S268-1, R-S268-3): what Documents and signatures leads with for this lease. It shows the
// first packet input, a form held on a named difference, the exact Source pending handoff (the
// form, the missing evidence and who supplies it), or the actual signing wait with the existing
// returned-document action. An Editor opens the existing Packet inputs at the named fact directly.
// Read only: showing it evaluates, prepares, uploads and sends nothing.

import { Button } from "@/components/ui";
import type { PacketLead } from "@/lib/lease-documents/lease-packet-readiness";
import { requestPacketInputs } from "./PacketInputsEditor";
import { RETURNED_DOCUMENTS_ANCHOR } from "./ReturnedDocumentsPanel";

export function PacketNextStep({
  lead,
  leaseId,
  canEditInputs,
}: Readonly<{
  lead: PacketLead;
  leaseId: string;
  /** Whether this person can save packet inputs; others are told who enters it. */
  canEditInputs: boolean;
}>) {
  if (lead.kind === "none") return null;
  return (
    <section
      aria-label="Next for this packet"
      className="ui-stack-tight renewal-packet-next"
      data-packet-lead={lead.kind}
      data-renewal-field="packet-next-step"
    >
      <h3>Next for this packet</h3>
      {lead.kind === "packet_input" ? (
        <>
          <p>
            <strong>Packet input needed:</strong> {lead.need} for {lead.form}.
          </p>
          {canEditInputs ? (
            <p>
              <Button
                onClick={() => requestPacketInputs(leaseId, lead.fieldKey)}
                size="compact"
                variant="secondary"
              >
                Enter it in Packet inputs
              </Button>
            </p>
          ) : (
            <p className="muted">An Editor enters it in Packet inputs.</p>
          )}
        </>
      ) : lead.kind === "hold" ? (
        <p>
          <strong>This form waits:</strong> {lead.form}. {lead.reason}
        </p>
      ) : lead.kind === "source_pending" ? (
        <>
          <p>
            <strong>Source pending:</strong> {lead.form}. Missing: {lead.evidence}.
            Responsible: {lead.role}.
          </p>
          <p className="muted">
            {lead.others > 0
              ? `${lead.others} other ${lead.others === 1 ? "form also waits" : "forms also wait"} on a source. `
              : ""}
            Each other form keeps its own readiness, and the manual handoff stays
            available.
          </p>
        </>
      ) : lead.kind === "signing_wait" ? (
        <>
          <p>
            <strong>Waiting on signatures:</strong> {lead.awaiting.join("; ")}.
          </p>
          <p>
            <a className="text-link" href={`#${RETURNED_DOCUMENTS_ANCHOR}`}>
              Record a returned document
            </a>
          </p>
        </>
      ) : lead.kind === "ready" ? (
        <p>
          Every form that applies has its approved original, map and inputs. Review and
          prepare it here, or hand it off by hand.
        </p>
      ) : (
        <p>{lead.reason}</p>
      )}
    </section>
  );
}
