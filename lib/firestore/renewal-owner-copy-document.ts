// S285 R-S285-2 (ARCH-S285-2): the exact owner copy v2.1 publication document, its own record
// beside v2.0's. Kept apart from the publication reads and writes so the Gmail draft claim can
// bind it without importing them.

import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { OWNER_RENEWAL_COPY_V2_1 } from "@/lib/lease-renewal/renewal-message-content";
import { OWNER_COPY_PUBLICATION_NAMES } from "@/lib/lease-renewal/owner-copy-version";

/**
 * The exact v2.1 publication document. Its governed draft family stays the supplied owner copy
 * ("owner-renewal:v2.0", the S24 registration the Gmail draft path checks); the copy itself is
 * "owner-renewal:v2.1" and a draft binds its exact content hash.
 */
export function ownerCopyV21Publication() {
  const document = {
    schemaVersion: "renewal-supplied-copy/v2",
    templateRef: "owner-renewal:v2.1",
    version: OWNER_RENEWAL_COPY_V2_1.version,
    authority: OWNER_RENEWAL_COPY_V2_1.authority,
    channel: "owner",
    copy: OWNER_RENEWAL_COPY_V2_1.owner,
    chargeLabels: {},
    signoff: OWNER_RENEWAL_COPY_V2_1.signoff,
    rules: [
      "Use current reviewed lease facts and explicit owner-approved terms.",
      "State the proposed renewal term only from the saved working start and end dates.",
      "Do not reuse example amounts, recipient addresses, signature values, editing notes or colors.",
      "Unresolved links and absent legal content do not appear in recipient copy.",
      "HTML and plain text come from the same reviewed model; attachments remain exact reviewed files.",
      "The managed sender reviews an unsent draft and sends manually in Gmail.",
    ],
  };
  return {
    name: OWNER_COPY_PUBLICATION_NAMES["v2.1"],
    body: JSON.stringify(document, null, 2),
    contentHash: hashExecutionPreview(document),
    /** The governed draft family the Gmail draft path checks. */
    ref: "owner-renewal:v2.0" as const,
    /** The copy version this record publishes. */
    copyRef: "owner-renewal:v2.1" as const,
    version: "v2.1" as const,
  };
}
