import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import { Card } from "@/components/ui";
import { dotloopSignatureHandoff } from "@/lib/lease-documents/dotloop-loop-link";
import type { LoopAssociationView } from "@/lib/lease-documents/dotloop-loop-association";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
} from "@/lib/lease-renewal/desk-destinations";

/** S34: what staff recorded about the outside signing, kept apart from provider evidence. */
export interface StaffExecutionReport {
  signatures: {
    outcome: string;
    recordedAt: string;
    occurredAt: string | null;
    source: string;
    reason: string | null;
  } | null;
  completion: {
    recordedAt: string;
    occurredAt: string | null;
    source: string;
    reason: string | null;
  } | null;
}

/**
 * S34: the lease's Dotloop loop, shown exactly as it was last read back.
 *
 * It states only observed facts. An absent status or participant count reads as needing
 * verification rather than as zero. No signature state comes from Dotloop: the official Public API
 * v2 documents no signature operation, so the workspace hands the operator to Dotloop and shows the
 * staff-reported result separately from provider and signed-artifact evidence.
 */
export function DotloopPacketLinkPanel({
  association,
  requiredSigners = [],
  refreshAvailable = false,
  refreshUnavailableReason,
  staffReport = null,
}: Readonly<{
  association: LoopAssociationView | null;
  requiredSigners?: readonly string[];
  refreshAvailable?: boolean;
  refreshUnavailableReason?: string;
  staffReport?: StaffExecutionReport | null;
}>) {
  // A loop linked for an earlier renewal cycle is not this cycle's signing loop until its reuse
  // is confirmed in the document handoff.
  const link =
    association?.state === "current" && association.loopId && association.currentCycle
      ? association
      : null;
  const earlierCycle =
    association?.state === "current" && association.loopId && !association.currentCycle
      ? association
      : null;
  const handoff = dotloopSignatureHandoff({ link, requiredSigners });
  const signatures = staffReport?.signatures;
  return (
    <Card title="Dotloop packet">
      {link ? (
        <ul className="ui-rows">
          <li className="ui-spread">
            <strong>Loop</strong>
            {link.loopUrl ? (
              <a
                className="text-link"
                href={link.loopUrl}
                rel={EXTERNAL_LINK_REL}
                target={EXTERNAL_LINK_TARGET}
              >
                Open loop {link.loopId} ↗
              </a>
            ) : (
              <span>Loop {link.loopId}</span>
            )}
          </li>
          <li className="ui-spread">
            <span>How it was chosen</span>
            <span>
              {link.origin === "app_created"
                ? "Created by the app from the company template"
                : "An existing loop staff reviewed and linked"}
            </span>
          </li>
          <li className="ui-spread">
            <span>Loop status</span>
            <span>{link.readback?.loopStatus ?? "Needs Verification"}</span>
          </li>
          <li className="ui-spread">
            <span>Participants</span>
            <span>{link.readback?.participantCount ?? "Needs Verification"}</span>
          </li>
          <li className="ui-spread">
            <span>App uploads</span>
            <span>
              {link.documents.length === 0
                ? "None yet"
                : `${link.documents.length} uploaded ${link.documents.length === 1 ? "version" : "versions"}`}
            </span>
          </li>
          <li className="ui-spread">
            <span>Last read back</span>
            <span>
              {formatBusinessTimestamp(link.readback?.readBackAt, "Needs Verification")}
            </span>
          </li>
        </ul>
      ) : earlierCycle ? (
        <p className="muted">
          {`The lease's linked loop ${earlierCycle.loopId} served an earlier renewal cycle. Confirm its reuse for this cycle in the document handoff before sending for signature.`}
        </p>
      ) : (
        <p className="muted">This renewal packet has no receipted Dotloop loop.</p>
      )}
      {/* Without a loop the line above already says so; the detail would repeat it. */}
      {link ? <p className="muted">{handoff.detail}</p> : null}
      {handoff.available && handoff.loopUrl ? (
        <p>
          <a
            className="text-link"
            href={handoff.loopUrl}
            rel={EXTERNAL_LINK_REL}
            target={EXTERNAL_LINK_TARGET}
          >
            {handoff.label} ↗
          </a>
        </p>
      ) : null}
      {handoff.requiredSigners.length > 0 ? (
        <p className="muted">Required signers: {handoff.requiredSigners.join(", ")}.</p>
      ) : null}
      {link && !refreshAvailable ? (
        <p className="muted">
          {refreshUnavailableReason ??
            "Reading this loop again needs a connected Dotloop account."}
        </p>
      ) : null}
      <div data-staff-execution-report>
        <strong>Staff-reported execution</strong>
        {signatures?.outcome === "done" ? (
          <p>
            Staff recorded the required signatures complete
            {signatures.occurredAt
              ? ` on ${formatCalendarDate(signatures.occurredAt)}`
              : ""}{" "}
            (recorded {formatBusinessTimestamp(signatures.recordedAt)}). Reference:{" "}
            {signatures.source}.
          </p>
        ) : (
          <p className="muted">
            Not recorded. After the signers finish in Dotloop, record the outside result
            in the signatures step.
          </p>
        )}
        {staffReport?.completion ? (
          <p>
            Renewal completion recorded by staff{" "}
            {formatBusinessTimestamp(staffReport.completion.recordedAt)}.
          </p>
        ) : null}
        <p className="muted">
          A staff report is not provider-verified or signed-artifact evidence; loop status
          and uploads never prove signatures.
        </p>
      </div>
    </Card>
  );
}
