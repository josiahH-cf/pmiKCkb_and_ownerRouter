// Tenant renewal-offer draft composer (Phase-1, draft-only; design "Tenant intake" stage).
//
// Produced AFTER the owner records a decision. Encodes the stay/leave ask, the offered rent, the
// possible charges (resident benefit package + insurance), and the info-form link — and renders ONE
// message for ALL THREE channels Dan requires (~00:36:56: "if you send a tenant a communication, you
// need to send it in every way possible"): email, the RentVine portal chat, and a text message.
//
// GOVERNANCE: draft ONLY. `production_allowed`/`send_allowed` are literal `false`; a human approves
// and sends each channel. Pure and deterministic: no I/O, no Date.now().

import { formatUsd, type DraftFact } from "@/lib/lease-renewal/owner-draft";

export type TenantChannel = "email" | "portal_chat" | "text";

export interface ChannelMessage {
  channel: TenantChannel;
  subject?: string;
  body: string;
}

export type OwnerDecision = "keep_same" | "increase" | "custom";

export interface TenantOfferInput {
  /** Tenant name label for the greeting (in-boundary; never written to git). */
  tenantNameLabel: string;
  leaseEndDateIso: string;
  ownerDecision: OwnerDecision;
  /** The rent being offered (owner-approved). */
  offeredRent: number;
  charges?: {
    /** Resident benefit package monthly. */
    rbp?: number;
    /** Renters-insurance monthly. */
    insurance?: number;
  };
  /** Link to the Google info-gathering form. */
  infoFormUrl?: string;
}

export interface TenantOfferDraft {
  kind: "tenant_renewal_offer";
  channels: Record<TenantChannel, ChannelMessage>;
  facts: DraftFact[];
  production_allowed: false;
  send_allowed: false;
}

function chargesLine(charges: TenantOfferInput["charges"]): string | null {
  const parts: string[] = [];
  if (charges?.rbp !== undefined)
    parts.push(`resident benefit package ${formatUsd(charges.rbp)}/mo`);
  if (charges?.insurance !== undefined)
    parts.push(`insurance ${formatUsd(charges.insurance)}/mo`);
  return parts.length > 0 ? `Possible charges: ${parts.join(", ")}.` : null;
}

/** Compose a tenant renewal-offer draft, rendered for email + portal chat + text. No send. */
export function buildTenantOfferDraft(input: TenantOfferInput): TenantOfferDraft {
  const offered = formatUsd(input.offeredRent);
  const charges = chargesLine(input.charges);
  const formAsk = input.infoFormUrl
    ? `Please also fill out this form so we have your info: ${input.infoFormUrl}`
    : null;

  const facts: DraftFact[] = [
    {
      key: "lease_end_date",
      label: "Lease end date",
      value: input.leaseEndDateIso,
      source: "Rentvine (read-authoritative)",
      confidence: "Verified",
    },
    {
      key: "offered_rent",
      label: "Offered rent",
      value: offered,
      source: "Owner decision",
      confidence: "Verified",
    },
  ];

  // Email + portal chat get the full message; the text is a short nudge that points back to it.
  const fullBody = [
    `Hello ${input.tenantNameLabel},`,
    ``,
    `Your lease ends on ${input.leaseEndDateIso}. We need to figure out if you plan to stay or leave.`,
    `If you'd like to renew, the rent would be ${offered}.`,
    ...(charges ? [charges] : []),
    ``,
    `Please let us know if you plan to stay or leave as soon as possible, and we'll get the documents out if you plan to stay.`,
    ...(formAsk ? ["", formAsk] : []),
    ``,
    `Thanks,`,
    `PMI KC Metro`,
  ].join("\n");

  const textBody = [
    `Hi ${input.tenantNameLabel}, your lease ends ${input.leaseEndDateIso}. Renewal rent would be ${offered}.`,
    `Please reply to let us know if you plan to stay or leave. We've also emailed and messaged you the details.`,
  ].join(" ");

  return {
    kind: "tenant_renewal_offer",
    channels: {
      email: {
        channel: "email",
        subject: `Your lease renewal, ending ${input.leaseEndDateIso}`,
        body: fullBody,
      },
      portal_chat: { channel: "portal_chat", body: fullBody },
      text: { channel: "text", body: textBody },
    },
    facts,
    production_allowed: false,
    send_allowed: false,
  };
}
