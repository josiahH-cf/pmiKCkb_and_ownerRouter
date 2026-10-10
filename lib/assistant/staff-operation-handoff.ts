// S202 routes explicit human requests to existing owning controls. This module can only read.
// A link is preparation/navigation, never a command, capability grant or effect receipt.
import { workflowComposerHref } from "@/lib/gmail-hub/composer-navigation";
import type { AnswerGroup } from "@/lib/assistant/conversation";
import type { ConversationTurn } from "@/lib/assistant/conversation-plan";
import type {
  OperationalContext,
  OperationalSource,
} from "@/lib/operational-context/types";
interface Handoff {
  summary: string;
  clarification: string | null;
  groups: AnswerGroup[];
  source: OperationalSource | null;
}
const intent =
  /^(?:(?:please|can you|could you|would you)\s+|i (?:want|need) you to\s+)*(send|schedule|compose|draft|create|add|update|change|correct|set|apply|record|close|cancel|delete|remove|assign|activate|approve)\b/i;
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export async function resolveStaffOperationHandoff(
  question: string,
  context: OperationalContext,
  previous: ConversationTurn | null,
): Promise<Handoff | null> {
  if (!intent.test(question)) return null;
  const text = question.toLowerCase(),
    hold = (
      summary: string,
      clarification: string | null = null,
      source: OperationalSource | null = null,
    ): Handoff => ({ summary, clarification, source, groups: [] });
  if (/\b(delete|remove|activate)\b/.test(text))
    return hold(
      "That effect is unavailable through the supported staff controls. No operation ran.",
    );
  const maintenance = /\b(maintenance|ticket|work order|repair|vendor)\b/.test(text),
    lease = /\b(lease|renewal|rent|owner|tenant|resident)\b/.test(text);
  const inherited = /\b(that|this|it)\b/.test(text)
    ? [...new Set(previous?.refs.map((r) => r.source) ?? [])]
    : [];
  const source: OperationalSource | null = maintenance
    ? "maintenance"
    : lease
      ? "renewals"
      : inherited.length === 1 &&
          (inherited[0] === "renewals" || inherited[0] === "maintenance")
        ? inherited[0]
        : null;
  if (!source)
    return hold(
      "Name the supported operation and its exact lease or maintenance ticket. No operation ran.",
      "Which lease or maintenance ticket should the normal staff control open?",
    );
  const message =
    /\b(send|schedule|compose|draft)\b/.test(text) &&
    /\b(messages?|emails?|notices?|repl(?:y|ies))\b/.test(text);
  const staffTask =
    /\b(create|add|assign)\b/.test(text) && /\b(task|follow.up)\b/.test(text);
  const ordinary =
    source === "renewals"
      ? /\b(working rent|working terms|renewal terms|source|sheet|rentvine|dates?|policy|progress|decision)\b/.test(
          text,
        )
      : /\b(assessment|work order|ticket|progress|status|history|vendor|close|completion|repair)\b/.test(
          text,
        );
  if (!message && !staffTask && !ordinary)
    return hold(
      "This request does not identify a supported staff control. No operation ran.",
    );
  if (message && source === "maintenance" && !/\bowner\b/.test(text))
    return hold(
      "The maintenance composer currently supports the reviewed owner message. Resident reply creation retains its own exact availability gate. No message was sent.",
      "Is this an owner message for a particular maintenance ticket?",
      source,
    );
  if (message && source === "renewals" && !/\b(owner|tenant|resident)\b/.test(text))
    return hold(
      "Choose the audience before opening the exact message control. No message was sent.",
      "Is the message for the owner or the tenant?",
      source,
    );
  const read = await context.read(source);
  if (read.status !== "ok" || read.truncated)
    return hold(
      read.status === "not_authorized"
        ? "Current access does not permit reading that target. No operation ran."
        : "A complete current target read is unavailable. Open the owning workspace when the source is available; no operation ran.",
      null,
      source,
    );
  const ids = [
    ...question.matchAll(
      source === "renewals"
        ? /\blease\s*(?:#|id\s*[:#]?)?\s*([A-Za-z0-9_-]{1,120})\b/gi
        : /\b(?:ticket|work order)\s*(?:#|id\s*[:#]?)?\s*([A-Za-z0-9_-]{1,120})\b/gi,
    ),
  ]
    .map((m) => m[1])
    .filter((id) => !["to", "for", "at", "the", "a", "an"].includes(id.toLowerCase()));
  if (new Set(ids).size > 1)
    return hold(
      "Review one exact target through its normal control. No operation ran.",
      source === "renewals"
        ? "Which lease should be handled first?"
        : "Which maintenance ticket should be handled first?",
      source,
    );
  let candidates = ids.length
    ? read.records.filter((r) => r.ref.id === ids[0])
    : read.records.filter((r) => {
        const label = normalize(r.title);
        return label.length >= 5 && normalize(question).includes(label);
      });
  if (!ids.length && !candidates.length && /\b(that|this|it)\b/.test(text)) {
    const refs = previous?.refs.filter((r) => r.source === source) ?? [];
    if (refs.length === 1)
      candidates = read.records.filter((r) => r.ref.id === refs[0].id);
  }
  if (candidates.length !== 1)
    return ids.length
      ? hold(
          "That exact target was not found in the current accessible records. No operation ran.",
          null,
          source,
        )
      : hold(
          "Choose the exact current target. No operation ran.",
          source === "renewals"
            ? "Which lease should the staff control open? Give its lease ID or full displayed address."
            : "Which maintenance ticket should the staff control open? Give its ticket ID or full displayed title.",
          source,
        );
  const record = candidates[0];
  let href = record.href,
    label = staffTask
      ? "Open lease-linked staff tasks"
      : source === "renewals"
        ? "Review the requested lease change"
        : "Review the requested maintenance operation";
  if (message) {
    const audience =
      source === "maintenance"
        ? "maintenance_owner"
        : /\bowner\b/.test(text)
          ? "renewal_owner"
          : "renewal_tenant";
    href =
      source === "maintenance"
        ? workflowComposerHref({ ticketId: record.ref.id, purpose: "maintenance_owner" })
        : workflowComposerHref({
            leaseId: record.ref.id,
            purpose: audience as "renewal_owner" | "renewal_tenant",
          });
    label = "Review message in Communications";
  }
  if (!href.startsWith("/") || href.startsWith("//"))
    return hold(
      "The owning record has no supported application destination. No operation ran.",
      null,
      source,
    );
  return {
    source,
    clarification: null,
    summary: `${label} for ${record.title}. Review its current target, inputs and consequences in the normal staff control, then use its explicit action. No operation has run from this conversation.`,
    groups: [
      {
        source,
        title: "Requested staff operation",
        summary:
          "The existing control uses your current signed-in authority and reports its own result.",
        status: read.status,
        total: 1,
        asOf: read.asOf,
        notes: [
          "Opening this link does not send, schedule, apply a provider update, or create a task.",
        ],
        link: null,
        items: [
          {
            ref: record.ref,
            title: label,
            detail: record.title,
            blockers: record.blockers,
            href,
          },
        ],
      },
    ],
  };
}
