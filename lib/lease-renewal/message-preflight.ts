import { formatBusinessTimestamp } from "@/lib/date-display";
import type { MessageReadiness } from "@/lib/lease-renewal/message-readiness";

/**
 * S129 (F09, R-F09-01 and R-F09-07): the meeting preflight for one audience's message, projected
 * from the same facts, readiness, sender, recipients, template publication and Gmail destination the
 * preparation itself uses. It is a read-only checklist: it never creates a draft, never sends, never
 * performs a paid lookup and never turns a technical pass into a live verdict. Items that only a
 * meeting can observe stay Pending meeting.
 */

export const PREFLIGHT_STATES = [
  "ready",
  "missing_input",
  "unavailable",
  "not_verified",
  "pending_meeting",
] as const;
export type PreflightState = (typeof PREFLIGHT_STATES)[number];

export const PREFLIGHT_STATE_LABELS: Record<PreflightState, string> = {
  ready: "Ready",
  missing_input: "Missing input",
  unavailable: "Unavailable",
  not_verified: "Not yet verified",
  pending_meeting: "Pending meeting",
};

export interface PreflightItem {
  readonly id: string;
  readonly label: string;
  readonly state: PreflightState;
  readonly detail: string;
  /** What the operator does instead when this item is not ready; never a workaround of a gate. */
  readonly fallback?: string;
  readonly target?:
    | { readonly kind: "control"; readonly id: string }
    | { readonly kind: "route"; readonly href: string };
}

export interface MessagePreflightInput {
  readonly channel: "owner" | "tenant";
  readonly canEdit: boolean;
  readonly senderEmail: string | null;
  readonly cycleId: string | null;
  readonly saved: boolean;
  readonly dirty: boolean;
  readonly needsReview: boolean;
  readonly signatureOrigin: "none" | "saved" | "retained_sender";
  readonly signatureMatchesActor: boolean;
  readonly readiness: MessageReadiness | null;
  readonly recipients:
    | { readonly status: "ready"; readonly to: string; readonly cc: readonly string[] }
    | { readonly status: "blocked"; readonly reasons: readonly string[] }
    | null;
  readonly publication: {
    readonly status: string;
    readonly ref?: string;
    readonly reason?: string;
  };
  readonly gmailDestination: boolean;
  readonly draftAttempt: {
    readonly state: string;
    readonly recoveryAvailable: boolean;
  } | null;
  readonly notices: readonly string[];
  /** When this surface last read the live facts; null until the first read completes. */
  readonly loadedAtIso: string | null;
}

export interface MessagePreflight {
  readonly items: readonly PreflightItem[];
  readonly counts: Readonly<Record<PreflightState, number>>;
  /** True when every technical item except Gmail export is ready, so preparation proceeds offline. */
  readonly proceedWithoutGmail: boolean;
  /** True when the unsent-draft step could be attempted now (still needs the person's confirmation). */
  readonly draftStepAvailable: boolean;
  readonly summary: string;
}

/** The three observations only a meeting supplies; a technical pass never marks them. */
export const PENDING_MEETING_ITEMS: readonly PreflightItem[] = [
  {
    id: "meeting_lease",
    label: "Selected meeting lease prepared by staff",
    state: "pending_meeting",
    detail:
      "Not observed. The real lease, its facts and its wording are reviewed at the meeting.",
  },
  {
    id: "meeting_mailbox",
    label: "Live mailbox, sender and recipient review",
    state: "pending_meeting",
    detail:
      "Not observed. The signed-in managed sender reviews the exact From, To and Cc at the meeting.",
  },
  {
    id: "meeting_draft",
    label: "One unsent draft created on explicit confirmation",
    state: "pending_meeting",
    detail:
      "Not observed. Only a person's exact confirmation creates the draft, and only a person sends in Gmail.",
  },
];

const GMAIL_ITEMS = new Set(["gmail_connection", "template"]);

export function projectMessagePreflight(input: MessagePreflightInput): MessagePreflight {
  const items: PreflightItem[] = [];
  const audience = input.channel === "owner" ? "owner" : "tenant";

  items.push(
    input.loadedAtIso
      ? {
          id: "source_read",
          label: "Live source facts",
          state: "ready",
          detail: `Read from RentVine and the app records at ${formatBusinessTimestamp(input.loadedAtIso)}; refresh re-reads them.`,
        }
      : {
          id: "source_read",
          label: "Live source facts",
          state: "unavailable",
          detail: "The live lease facts have not been read on this surface yet.",
          fallback: "Refresh the page; saved preparation is retained.",
        },
  );
  items.push(
    input.cycleId
      ? {
          id: "cycle",
          label: "Reviewed renewal cycle",
          state: "ready",
          detail: `Preparation binds to cycle ${input.cycleId}.`,
        }
      : {
          id: "cycle",
          label: "Reviewed renewal cycle",
          state: "missing_input",
          detail: "Select and review the current renewal cycle before preparing.",
          target: { kind: "control", id: "renewal-manual-cycle" },
        },
  );
  const readiness = input.readiness;
  const inputItems = readiness
    ? readiness.items.filter((item) => item.field !== "review")
    : [];
  items.push(
    readiness && inputItems.length === 0
      ? {
          id: "required_inputs",
          label: `Required ${audience} message inputs`,
          state: "ready",
          detail: "Every required input is filled from its source or reviewed by staff.",
        }
      : {
          id: "required_inputs",
          label: `Required ${audience} message inputs`,
          state: "missing_input",
          detail: readiness
            ? `${inputItems.length} input${inputItems.length === 1 ? "" : "s"} remain: ${inputItems
                .slice(0, 3)
                .map((item) => item.target.label)
                .join("; ")}${inputItems.length > 3 ? "; and more" : ""}.`
            : "Readiness has not been computed yet.",
          target: { kind: "control", id: `renewal-message-${input.channel}-readiness` },
        },
  );
  items.push(
    input.saved && !input.dirty && !input.needsReview
      ? {
          id: "review",
          label: "Reviewed and saved against current facts",
          state: "ready",
          detail: "The saved review matches the current source facts.",
        }
      : {
          id: "review",
          label: "Reviewed and saved against current facts",
          state: "missing_input",
          detail: input.dirty
            ? "Unsaved edits differ from the saved record."
            : input.saved
              ? "The saved review no longer matches the current source facts."
              : "No preparation is saved for this cycle and audience.",
          target: { kind: "control", id: `renewal-message-${input.channel}-reviewed` },
        },
  );
  items.push(
    input.senderEmail
      ? {
          id: "sender",
          label: "Signed-in managed sender",
          state: "ready",
          detail: `Drafts are created in ${input.senderEmail}; no other mailbox is used.`,
        }
      : {
          id: "sender",
          label: "Signed-in managed sender",
          state: "unavailable",
          detail: "No managed sender is signed in.",
        },
  );
  items.push(
    input.signatureOrigin === "saved" && input.signatureMatchesActor
      ? {
          id: "signature",
          label: "Sender signature",
          state: "ready",
          detail: "The saved signature belongs to the signed-in sender.",
        }
      : input.signatureOrigin === "retained_sender"
        ? {
            id: "signature",
            label: "Sender signature",
            state: "not_verified",
            detail:
              "Filled from your retained signature; review and save it before final use.",
            target: {
              kind: "control",
              id: `renewal-message-${input.channel}-signature-name`,
            },
          }
        : input.signatureOrigin === "saved"
          ? {
              id: "signature",
              label: "Sender signature",
              state: "missing_input",
              detail:
                "The saved signature belongs to another sender; review it as yourself.",
              target: {
                kind: "control",
                id: `renewal-message-${input.channel}-adopt-signature`,
              },
            }
          : {
              id: "signature",
              label: "Sender signature",
              state: "missing_input",
              detail: "No signature is saved for this preparation.",
              target: {
                kind: "control",
                id: `renewal-message-${input.channel}-signature-name`,
              },
            },
  );
  items.push(
    input.recipients?.status === "ready"
      ? {
          id: "recipients",
          label: `${audience === "owner" ? "Owner" : "Tenant"} recipients`,
          state: "ready",
          detail: `To ${input.recipients.to}${input.recipients.cc.length ? `; Cc ${input.recipients.cc.length}` : ""}, from the current lease roster.`,
        }
      : {
          id: "recipients",
          label: `${audience === "owner" ? "Owner" : "Tenant"} recipients`,
          state: "unavailable",
          detail: input.recipients
            ? input.recipients.reasons.join(" ")
            : "Recipients have not been resolved.",
          fallback:
            "Resolve the contact at its source; the reviewed body still copies for another channel.",
        },
  );
  items.push(
    input.publication.status === "approved"
      ? {
          id: "template",
          label: "Approved message template",
          state: "ready",
          detail: `Supplied template v2.0${input.publication.ref ? ` (${input.publication.ref})` : ""} is published and approved.`,
        }
      : {
          id: "template",
          label: "Approved message template",
          state: "unavailable",
          detail: input.publication.reason ?? "The template publication is not approved.",
          fallback:
            "Preparation, review and local copy continue; the Gmail draft waits for the approved publication.",
        },
  );
  items.push(
    input.canEdit
      ? {
          id: "permitted_action",
          label: "Permitted action",
          state: "ready",
          detail:
            "Editor access: preview and exactly confirm one unsent draft; nothing here sends.",
        }
      : {
          id: "permitted_action",
          label: "Permitted action",
          state: "unavailable",
          detail:
            "This session can read and copy only; creating a draft needs Editor access.",
          fallback: "Ask an Editor to review and create the draft.",
        },
  );
  items.push(
    input.gmailDestination
      ? {
          id: "gmail_connection",
          label: "Managed Gmail Drafts destination",
          state: "ready",
          detail:
            "The Drafts folder of the managed mailbox is available for the handoff.",
        }
      : {
          id: "gmail_connection",
          label: "Managed Gmail Drafts destination",
          state: "unavailable",
          detail: "No managed Gmail destination is available for this sender.",
          fallback:
            "Copy the reviewed formatted or plain body and connect Gmail on Connections; saved work is kept.",
          target: { kind: "route", href: "/connections" },
        },
  );
  items.push(
    input.draftAttempt?.recoveryAvailable
      ? {
          id: "attempt_recovery",
          label: "Open draft attempt",
          state: "not_verified",
          detail: `A saved attempt is ${input.draftAttempt.state}; recover it before creating another draft.`,
          fallback:
            "Use Recover; an ambiguous result is reconciled, never retried blindly.",
        }
      : {
          id: "attempt_recovery",
          label: "Open draft attempt",
          state: "ready",
          detail: "No open attempt; a new preview starts clean.",
        },
  );
  for (const [index, notice] of input.notices.entries())
    items.push({
      id: `notice_${index + 1}`,
      label: "Source notice",
      state: "not_verified",
      detail: notice,
    });
  items.push(...PENDING_MEETING_ITEMS);

  const counts = Object.fromEntries(
    PREFLIGHT_STATES.map((state) => [
      state,
      items.filter((item) => item.state === state).length,
    ]),
  ) as Record<PreflightState, number>;
  const technical = items.filter((item) => item.state !== "pending_meeting");
  const proceedWithoutGmail = technical.every(
    (item) => item.state === "ready" || GMAIL_ITEMS.has(item.id),
  );
  const draftStepAvailable = technical.every((item) => item.state === "ready");
  const summary = `Meeting preflight: ${counts.ready} ready, ${counts.missing_input} missing, ${counts.unavailable} unavailable, ${counts.not_verified} not yet verified, ${counts.pending_meeting} pending meeting. ${
    draftStepAvailable
      ? "The unsent-draft step can be attempted on explicit confirmation."
      : proceedWithoutGmail
        ? "Preparation can proceed without Gmail; the unsent-draft step stays pending."
        : "Resolve the listed items before the unsent-draft step."
  }`;
  return { items, counts, proceedWithoutGmail, draftStepAvailable, summary };
}

/**
 * AC-S129-1: each user-visible step of the owner and tenant draft path tied to the current control,
 * the owning service and the deterministic check that covers it. A structural test asserts every
 * path exists, so a renamed or removed owner becomes a concrete defect rather than a stale claim.
 */
export const MESSAGE_PATH_EVIDENCE_MATRIX = [
  {
    step: "Load the live facts, saved preparation and sender basis",
    control: "components/lease-renewal/RenewalMessagePreparation.tsx",
    service: "lib/lease-renewal/current-renewal-message.ts",
    route: "app/api/lease-renewal/message-preparation/route.ts",
    tests: ["tests/unit/s120-message-preparation-controls.test.tsx"],
  },
  {
    step: "Compose audience-specific content from the authoritative projection",
    control: "components/lease-renewal/RenewalMessagePreparation.tsx",
    service: "lib/lease-renewal/renewal-message-content.ts",
    tests: [
      "tests/unit/s113-message-preparation-controls.test.tsx",
      "tests/unit/renewal-copy-boundary.test.ts",
    ],
  },
  {
    step: "Route each missing input to its exact control and gate final copy",
    control: "components/lease-renewal/RenewalMessagePreparation.tsx",
    service: "lib/lease-renewal/message-readiness.ts",
    tests: [
      "tests/unit/s120-message-readiness.test.ts",
      "tests/unit/s120-message-preparation-controls.test.tsx",
    ],
  },
  {
    step: "Keep recipients audience-separated from the current roster",
    control: "components/lease-renewal/RenewalMessagePreparation.tsx",
    service: "lib/lease-renewal/recipient-resolution.ts",
    tests: ["tests/unit/renewal-notice-draft-service.test.ts"],
  },
  {
    step: "Reuse a signature only for the same signed-in managed sender",
    control: "components/lease-renewal/RenewalMessagePreparation.tsx",
    service: "lib/firestore/renewal-sender-signatures.ts",
    tests: ["tests/firestore/s120-sender-signature.test.ts"],
  },
  {
    step: "Block a direct draft on the server for unresolved content, review, signature, template, recipients, a confirmed move-out or a policy gate",
    control: "components/lease-renewal/RenewalMessagePreparation.tsx",
    service: "lib/lease-renewal/execution/supplied-renewal-draft-preview.ts",
    tests: [
      "tests/unit/s124-move-out-disposition.test.ts",
      "tests/unit/s129-draft-boundary.test.ts",
    ],
  },
  {
    step: "Preview, exactly confirm, claim, receipt and read back one unsent draft",
    control: "components/lease-renewal/RenewalMessagePreparation.tsx",
    service: "lib/lease-renewal/execution/renewal-notice-draft-service.ts",
    route: "app/api/lease-renewal/renewal-notice-draft/route.ts",
    tests: [
      "tests/unit/renewal-notice-draft-service.test.ts",
      "tests/unit/renewal-notice-draft-route.test.ts",
      "tests/unit/renewal-notice-draft-contract.test.ts",
    ],
  },
  {
    step: "Recover a duplicate submit, a lost response or a partial provider result without another draft",
    control: "components/lease-renewal/RenewalMessagePreparation.tsx",
    service: "lib/lease-renewal/execution/renewal-notice-draft-service.ts",
    tests: [
      "tests/unit/governed-draft-execution.test.ts",
      "tests/unit/s107-effect-continuation.test.ts",
    ],
  },
  {
    step: "Show the meeting preflight and the pending human observations",
    control: "components/lease-renewal/RenewalMessagePreparation.tsx",
    service: "lib/lease-renewal/message-preflight.ts",
    tests: [
      "tests/unit/s129-message-preflight.test.ts",
      "tests/unit/s129-preflight-surface.test.tsx",
    ],
  },
] as const;
