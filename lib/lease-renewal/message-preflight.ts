import { formatBusinessTimestamp } from "@/lib/date-display";
import type { MessageReadiness } from "@/lib/lease-renewal/message-readiness";

/**
 * S129 (F09, R-F09-01 and R-F09-07): the meeting preflight for one audience's message, projected
 * from the same facts, readiness, sender, recipients, template publication and Gmail destination the
 * preparation itself uses. It is a read-only checklist: it never creates a draft, never sends, never
 * performs a paid lookup and never turns a technical pass into a live verdict. Items that only a
 * meeting can observe stay Pending meeting.
 *
 * S161/S162: it names no renewal cycle and no review step, because neither exists. Marked values
 * and the sender signature are shown for information and never make the draft step unavailable;
 * the draft step depends only on what the exact Gmail action itself needs.
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
  readonly signatureOrigin: "none" | "saved" | "retained_sender" | "business_profile";
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
/** Shown for information; a marked value or an unsigned message never withholds a step. */
const INFORMATION_ITEMS = new Set(["required_inputs", "signature"]);

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
          fallback: "Refresh the page; your saved wording is kept.",
        },
  );
  const readiness = input.readiness;
  const marked = readiness?.items ?? [];
  items.push(
    readiness && marked.length === 0
      ? {
          id: "required_inputs",
          label: `Values in the ${audience} message`,
          state: "ready",
          detail: "Every value in the message is filled in.",
        }
      : {
          id: "required_inputs",
          label: `Values in the ${audience} message`,
          state: "missing_input",
          detail: readiness
            ? `${marked.length} ${marked.length === 1 ? "value is" : "values are"} marked: ${marked
                .slice(0, 3)
                .map((item) => item.target.label)
                .join(
                  "; ",
                )}${marked.length > 3 ? "; and more" : ""}. The message can be edited, copied and drafted as it is.`
            : "The message has not been read yet.",
          target: { kind: "control", id: `renewal-message-${input.channel}-readiness` },
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
      : input.signatureOrigin === "retained_sender" ||
          input.signatureOrigin === "business_profile"
        ? {
            id: "signature",
            label: "Sender signature",
            state: "ready",
            detail: "Filled from your retained signature.",
          }
        : input.signatureOrigin === "saved"
          ? {
              id: "signature",
              label: "Sender signature",
              state: "not_verified",
              detail:
                "The saved signature was entered by another sender. It is shown as saved; use your own if you prefer.",
              target: {
                kind: "control",
                id: `renewal-message-${input.channel}-signature-name`,
              },
            }
          : {
              id: "signature",
              label: "Sender signature",
              state: "missing_input",
              detail: "No signature is entered; the message marks where it goes.",
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
            "Resolve the contact at its source; the message still copies for another channel.",
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
            "Editing and copy continue; the Gmail draft waits for the approved publication.",
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
          fallback: "Ask an Editor to create the draft.",
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
            "Copy the formatted or plain body and connect Gmail on Connections; saved work is kept.",
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
  const technical = items.filter(
    (item) => item.state !== "pending_meeting" && !INFORMATION_ITEMS.has(item.id),
  );
  const proceedWithoutGmail = technical.every(
    (item) => item.state === "ready" || GMAIL_ITEMS.has(item.id),
  );
  const draftStepAvailable = technical.every((item) => item.state === "ready");
  const summary = `Meeting preflight: ${counts.ready} ready, ${counts.missing_input} missing, ${counts.unavailable} unavailable, ${counts.not_verified} not yet verified, ${counts.pending_meeting} pending meeting. ${
    draftStepAvailable
      ? "The unsent-draft step can be attempted on explicit confirmation."
      : proceedWithoutGmail
        ? "Editing and copy continue without Gmail; the unsent-draft step stays pending."
        : "Editing and copy continue; the unsent-draft step waits for the listed items."
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
    step: "Load the live facts, saved wording and sender basis",
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
    step: "Name each missing value and route it to where it is recorded",
    control: "components/lease-renewal/RenewalMessagePreparation.tsx",
    service: "lib/lease-renewal/message-readiness.ts",
    tests: [
      "tests/unit/s120-message-readiness.test.ts",
      "tests/unit/s161-editable-message-composition.test.ts",
      "tests/unit/s161-s162-message-editor.test.tsx",
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
    step: "Refuse a direct draft on the server for notice safety, a confirmed move-out, the template publication, unresolved recipients or an unsaved message",
    control: "components/lease-renewal/RenewalMessagePreparation.tsx",
    service: "lib/lease-renewal/execution/supplied-renewal-draft-preview.ts",
    tests: [
      "tests/unit/s124-move-out-disposition.test.ts",
      "tests/unit/s129-draft-boundary.test.ts",
      "tests/unit/s162-draft-as-displayed.test.ts",
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
