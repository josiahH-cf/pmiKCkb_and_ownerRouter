// S34: the durable link between one approved packet snapshot and its one Dotloop loop.
//
// Loop identity is bound to the packet snapshot hash. Repeating the action for the same hash returns
// the stored link without touching the provider; a new hash marks the prior loop superseded and
// requires a fresh confirmation for a replacement loop. Nothing here calls a provider.
//
// The official Public API v2 documents no e-signature operation, so signature work is an explicit
// handoff: the workspace shows the exact loop URL and the required signers, and completion is
// recorded only from the existing signed-artifact evidence path, never inferred from loop state.

export interface DotloopLoopLink {
  readonly loopId: string;
  readonly loopUrl: string | null;
  readonly profileId: string;
  readonly templateId: string;
  /** The exact S66 packet snapshot hash this loop was created from. */
  readonly packetSnapshotHash: string;
  readonly readBackAtIso: string | null;
  readonly loopStatus: string | null;
  readonly participantCount: number | null;
  readonly documentCount: number | null;
}

export type DotloopLoopDecision =
  | { readonly kind: "reuse"; readonly link: DotloopLoopLink }
  | { readonly kind: "create" }
  | { readonly kind: "superseded"; readonly priorLink: DotloopLoopLink };

/**
 * Decide what a confirmed packet action may do. `reuse` performs no provider call at all;
 * `superseded` refuses to reuse a loop built from different facts and requires a new confirmation.
 */
export function decideDotloopLoopAction(input: {
  readonly currentPacketSnapshotHash: string;
  readonly storedLink: DotloopLoopLink | null;
}): DotloopLoopDecision {
  const current = input.currentPacketSnapshotHash.trim();
  if (current === "") {
    throw new Error("A Dotloop loop decision needs the exact packet snapshot hash.");
  }
  if (!input.storedLink) return { kind: "create" };
  if (input.storedLink.packetSnapshotHash === current) {
    return { kind: "reuse", link: input.storedLink };
  }
  return { kind: "superseded", priorLink: input.storedLink };
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
  readonly link: DotloopLoopLink | null;
  readonly requiredSigners: readonly string[];
}): DotloopSignatureHandoff {
  const loopUrl = input.link?.loopUrl ?? null;
  return {
    available: Boolean(loopUrl),
    label: "Open in Dotloop to send for signature",
    loopUrl,
    requiredSigners: [...input.requiredSigners],
    detail: loopUrl
      ? "Send for signature in Dotloop; this workspace records completion only from the signed artifact."
      : "The renewal packet has no Dotloop loop yet, so there is nothing to send for signature.",
  };
}

/** Merge one readback into the stored link. Absent observations stay absent, never zero. */
export function applyDotloopLoopReadback(
  link: DotloopLoopLink,
  observation: {
    readonly readBackAtIso: string;
    readonly loopStatus?: string | null;
    readonly loopUrl?: string | null;
    readonly participantCount?: number | null;
    readonly documentCount?: number | null;
  },
): DotloopLoopLink {
  return {
    ...link,
    readBackAtIso: observation.readBackAtIso,
    loopStatus: observation.loopStatus ?? link.loopStatus,
    loopUrl: observation.loopUrl ?? link.loopUrl,
    participantCount: observation.participantCount ?? link.participantCount,
    documentCount: observation.documentCount ?? link.documentCount,
  };
}
