/** S34 display-only evidence. Execution still revalidates through the normal action owners. */
export interface PacketReadinessDimension {
  state: string;
  label: string;
  reasons: string[];
}
export interface PacketOperationReadiness {
  actionKey: string;
  /** Includes this operation's content, connection, target and exact-authority holds. */
  blockers: string[];
  dimensions: {
    technical: PacketReadinessDimension;
    content: PacketReadinessDimension;
    connection: PacketReadinessDimension;
    target: PacketReadinessDimension;
    authority: PacketReadinessDimension;
  };
}

export function projectPacketOperationReadiness(input: {
  actionKey: string;
  contentBlockers: string[];
  connectionBlockers: string[];
  targetBlockers: string[];
  authority: PacketReadinessDimension;
}): PacketOperationReadiness {
  const dimension = (reasons: string[], ready: string, blocked: string) => ({
    state: reasons.length ? "blocked" : "ready",
    label: reasons.length ? blocked : ready,
    reasons: [...reasons],
  });
  return {
    actionKey: input.actionKey,
    blockers: [
      ...new Set([
        ...input.contentBlockers,
        ...input.connectionBlockers,
        ...input.authority.reasons,
        ...input.targetBlockers,
      ]),
    ],
    dimensions: {
      technical: {
        state: "supported",
        label: "Supported app path; live provider completion remains unverified",
        reasons: [
          "Normal preview, exact confirmation, one-attempt claim and receipt recovery are implemented. A person reviews and sends signatures in Dotloop.",
        ],
      },
      content: dimension(
        input.contentBlockers,
        "Current packet prerequisites read",
        "Packet content or approval needs attention",
      ),
      connection: dimension(
        input.connectionBlockers,
        "Managed connection and selected resource ready",
        "Connection or selected resource needs attention",
      ),
      target: dimension(
        input.targetBlockers,
        "Operation target available",
        "Operation target needs attention",
      ),
      authority: input.authority,
    },
  };
}
