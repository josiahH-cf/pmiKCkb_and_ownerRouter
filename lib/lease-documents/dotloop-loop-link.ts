// S34: the loop evidence one packet snapshot's execution projection carries, and the explicit
// signature handoff the workspace renders.
//
// The lease's loop target itself is the loop association (`dotloop-loop-association.ts`); a changed
// packet snapshot never creates a replacement loop. The official Public API v2 documents no
// e-signature operation, so signature work is an explicit handoff: the workspace shows the exact
// loop URL and the required signers, and completion is recorded by staff or from signed-artifact
// evidence, never inferred from loop state.

export interface DotloopLoopLink {
  readonly loopId: string;
  readonly loopUrl: string | null;
  readonly profileId: string;
  readonly templateId: string;
  /** The exact S66 packet snapshot hash whose execution recorded this observation. */
  readonly packetSnapshotHash: string;
  readonly readBackAtIso: string | null;
  readonly loopStatus: string | null;
  readonly participantCount: number | null;
  readonly documentCount: number | null;
}

export interface DotloopSignatureHandoff {
  readonly available: boolean;
  readonly label: string;
  readonly loopUrl: string | null;
  readonly requiredSigners: readonly string[];
  readonly detail: string;
}

/**
 * The signature handoff a workspace phase renders. It never claims a signature state: the API
 * exposes none, so the operator opens Dotloop and the app waits for signed-artifact evidence.
 */
export function dotloopSignatureHandoff(input: {
  readonly link: { readonly loopUrl: string | null } | null;
  readonly requiredSigners: readonly string[];
}): DotloopSignatureHandoff {
  const loopUrl = input.link?.loopUrl ?? null;
  return {
    available: Boolean(loopUrl),
    label: "Open in Dotloop to send for signature",
    loopUrl,
    requiredSigners: [...input.requiredSigners],
    detail: loopUrl
      ? "Assign signature fields and send for signature in Dotloop. Staff record the outside result here; an upload is never a signature."
      : "The renewal packet has no Dotloop loop yet, so there is nothing to send for signature.",
  };
}
