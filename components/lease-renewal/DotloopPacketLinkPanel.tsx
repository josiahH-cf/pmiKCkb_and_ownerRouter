import { Card } from "@/components/ui";
import {
  dotloopSignatureHandoff,
  type DotloopLoopLink,
} from "@/lib/lease-documents/dotloop-loop-link";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
} from "@/lib/lease-renewal/desk-destinations";

/**
 * S34: the renewal packet's one Dotloop loop, shown exactly as it was last read back.
 *
 * It states only observed facts. An absent status, participant count, or document count reads as
 * needing verification rather than as zero, and no signature state is shown at all: the official
 * Public API v2 documents no signature operation, so the workspace hands the operator to Dotloop and
 * waits for the signed artifact.
 */
export function DotloopPacketLinkPanel({
  link,
  requiredSigners = [],
  refreshAvailable = false,
  refreshUnavailableReason,
}: Readonly<{
  link: DotloopLoopLink | null;
  requiredSigners?: readonly string[];
  refreshAvailable?: boolean;
  refreshUnavailableReason?: string;
}>) {
  const handoff = dotloopSignatureHandoff({ link, requiredSigners });
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
            <span>Loop status</span>
            <span>{link.loopStatus ?? "Needs Verification"}</span>
          </li>
          <li className="ui-spread">
            <span>Participants</span>
            <span>{link.participantCount ?? "Needs Verification"}</span>
          </li>
          <li className="ui-spread">
            <span>Documents</span>
            <span>{link.documentCount ?? "Needs Verification"}</span>
          </li>
          <li className="ui-spread">
            <span>Last read back</span>
            <span>{link.readBackAtIso ?? "Needs Verification"}</span>
          </li>
        </ul>
      ) : (
        <p className="muted">
          This renewal packet has no Dotloop loop yet. Confirm the packet to create one.
        </p>
      )}
      <p className="muted">{handoff.detail}</p>
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
      {refreshAvailable ? null : (
        <p className="muted">
          {refreshUnavailableReason ??
            "Reading this loop again needs a connected Dotloop account."}
        </p>
      )}
    </Card>
  );
}
