// EvidencePacketCard — renders the Move-Out deposit-disposition evidence packet on the desk
// (space-teeth E2f). Read-only, draft-only: the suggested deduction is ALWAYS shown with its
// SUGGESTION-ONLY label and its evidence lines (each with a source); the statutory deadline + legal
// wording render as literal Needs-Verification placeholders. Never posts to any ledger or SoR.

import { Card } from "@/components/ui";
import { DRAFT_BANNER } from "@/lib/constants";
import { formatUsd } from "@/lib/lease-renewal/owner-draft";
import type { EvidencePacket } from "@/lib/move-out/evidence-packet";

export function EvidencePacketCard({ packet }: Readonly<{ packet: EvidencePacket }>) {
  return (
    <Card title="Deposit deduction — evidence packet">
      <p className="review-pill">{DRAFT_BANNER}</p>

      {packet.lines.length === 0 ? (
        <p className="muted">
          No evidence entered yet. Add inspection charges, vendor bids, RentVine ledger
          refs, and the lock-change / 4265 charge to see a suggested deduction.
        </p>
      ) : (
        <ul className="ui-rows">
          {packet.lines.map((line) => (
            <li className="ui-spread" key={line.key}>
              <span>
                {line.label} <span className="muted">— {line.source}</span>
              </span>
              <span>{formatUsd(line.amountCents / 100)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="ui-spread">
        <strong>{packet.suggestedDeductionLabel}</strong>
        <strong>{packet.suggestedDeductionFormatted}</strong>
      </div>

      <h3>Needs Verification</h3>
      <ul className="compact-list">
        <li>{packet.statutoryDeadline}</li>
        <li>{packet.legalWordingNote}</li>
      </ul>
    </Card>
  );
}
