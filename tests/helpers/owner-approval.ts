// S234 R-S234-1 test fixtures: synthetic approval evidence only, never a live owner or value.
import type { OwnerApprovalVerification } from "@/lib/firestore/renewal-workspace";
import type { OwnerApprovalInput } from "@/lib/lease-renewal/workspace-state";

/** A named representative and a conversation: typed facts the planner records as given. */
export const SYNTHETIC_APPROVAL: OwnerApprovalInput = {
  party: {
    kind: "representative",
    name: "Example Representative",
    capacity: "Synthetic owner's agent",
  },
  channel: { kind: "conversation", participants: "Example Owner LLC and renewal staff" },
  occurredAt: "2024-01-02T15:00:00.000Z",
};

/** The current owner roster a synthetic lease's source read returns. */
export const SYNTHETIC_OWNER_ROSTER: OwnerApprovalVerification = {
  ownerRoster: async () => [
    { label: "Example Owner LLC", sourceRef: "rentvine:export:portfolio.owners[0].name" },
  ],
};
