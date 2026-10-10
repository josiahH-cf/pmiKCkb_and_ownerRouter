import { renderInlineMessageParagraph } from "@/lib/email/inline-runs";
import {
  firstUsableComparables,
  comparableDistanceLabel,
} from "@/lib/lease-renewal/comparable-presentation";
import { z } from "zod";
import { UNVERIFIED_PLACEHOLDER } from "@/lib/constants";
import { formatCalendarDate } from "@/lib/date-display";

/** Normalized from the owner's September 10 source pack; no example customer or sender values. */
export const SUPPLIED_RENEWAL_COPY = Object.freeze({
  version: "v2.0" as const,
  authority: "client-approval:s113-supplied-templates-2026-09-10" as const,
  owner: {
    subject: "Lease Renewal for {{property_address}}",
    introduction: "We have a renewal coming up for {{property_address}}.",
    currentRent: "We are currently charging them {{current_base_rent}} per month.",
    market:
      "I am seeing similar comps in the area ranging from {{market_low}} to {{market_high}}.",
    request:
      "Take a look below at similar units currently available in that price range and let us know how you want to proceed with this year's rent increase.",
    consideration:
      "When considering an increase, it is important to find a balance. Raising the rent significantly can lead to tenant dissatisfaction and potential vacancy. However, leaving the rent unchanged can be detrimental in the long run, as it fails to keep pace with the inevitable increases in insurance and property taxes.",
    closing: "I look forward to hearing how you would like to proceed.",
    suggestion: "Our reviewed rental analysis suggests {{suggested_rent}} per month.",
  },
  tenant: {
    introduction:
      "Your lease ends on {{lease_end_date}}. Please let us know whether you plan to stay or leave. Your renewal offer is below.",
    response:
      "Please let us know if you plan to stay or leave as soon as possible, and we'll get the documents out if you plan to stay.",
    informationForm:
      "Please complete the renewal information form so we have your updated information.",
    insuranceChange:
      "We have changed our insurance process. Please review the insurance flyer. An additional document will accompany your renewal documents. Our third-party provider will review your personal insurance. The insurance charge begins with the renewal and continues until your personal insurance is approved.",
    unchanged: "All other charges stay the same.",
    terms:
      "Rent: {{rent}} per month, effective {{start}}. Renewal term: {{start}} through {{end}}.",
    monthlyHeading: "Other monthly charges",
    oneTimeHeading: "One-time charges",
    chargeLine: "{{label}}: {{amount}}{{cadence}}, effective {{effective_date}}.",
    monthlyCadence: " per month",
    oneTimeCadence: " one time",
    insuranceLinkLabel: "Insurance flyer",
    informationLinkLabel: "Renewal information form",
    rbpLinkLabel: "Resident Benefits Package information",
  },
  signoff: "Kindest Regards,",
});

/**
 * S120 (R120.5): the optional response-request wording replaces exactly one paragraph of the
 * approved copy. These sentences name that paragraph for the field's help; blank keeps the default.
 */
export const RESPONSE_REQUEST_PLACEMENT = Object.freeze({
  owner:
    "the request paragraph that follows the market-range sentence and precedes the comparable evidence",
  tenant:
    "the response paragraph after the terms, charges and insurance wording and before the request to complete the renewal information form",
} as const);

/** The paragraph the current wording edit produces, or the approved default when it is blank. */
export function responseRequestParagraph(
  channel: "owner" | "tenant",
  edits: { responseRequest: string },
): { text: string; isDefault: boolean } {
  const custom = edits.responseRequest.trim();
  if (custom) return { text: custom, isDefault: false };
  return {
    text:
      channel === "owner"
        ? SUPPLIED_RENEWAL_COPY.owner.request
        : SUPPLIED_RENEWAL_COPY.tenant.response,
    isDefault: true,
  };
}

/** Replace only the named fields; unresolved authoring tokens never reach copy. */
function fillSuppliedCopy(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => {
    if (!(key in values)) throw new Error(`Missing supplied-copy field ${key}.`);
    return values[key];
  });
}

const shortText = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) => !/[\u0000-\u001f\u007f]|\{\{|\}\}/.test(value),
    "Use plain text without control characters or template tokens.",
  );
const source = shortText;
export const messageMoney = z
  .number()
  .finite()
  .nonnegative()
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001,
    "Use cents precision.",
  );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
  );
export const MessageLinkSchema = z
  .object({
    url: z
      .string()
      .trim()
      .url()
      .refine((value) => {
        const parsed = new URL(value);
        return parsed.protocol === "https:" && !parsed.username && !parsed.password;
      }),
    source,
  })
  .strict();

export const MESSAGE_CHARGES = {
  rbp: "Resident Benefits Package",
  insurance: "Insurance",
  pet: "Pet rent",
  utilities: "Water / sewer",
  renewal_processing: "Renewal processing fee",
  pet_processing: "Pet processing fee",
} as const;
export const MessageChargeSchema = z
  .object({
    id: z.enum([
      "rbp",
      "insurance",
      "pet",
      "utilities",
      "renewal_processing",
      "pet_processing",
    ]),
    applicable: z.boolean().nullable(),
    amount: messageMoney.nullable(),
    cadence: z.enum(["monthly", "one_time"]).nullable(),
    effectiveDate: date.nullable(),
    source: source.nullable(),
    comparison: z.enum(["unchanged", "changed", "new", "unverified"]),
  })
  .strict();
export type MessageCharge = z.infer<typeof MessageChargeSchema>;

export const ManagedMessageSignatureSchema = z
  .object({
    name: shortText,
    email: z
      .string()
      .email()
      .refine((value) => value.toLowerCase().endsWith("@pmikcmetro.com")),
    source,
    role: shortText.nullable(),
    phone: shortText.nullable(),
    hours: shortText.nullable(),
    website: MessageLinkSchema.nullable(),
  })
  .strict();
export type ManagedMessageSignature = z.infer<typeof ManagedMessageSignatureSchema>;

/** Editable prose is bounded separately from sourced facts; source changes preserve it for review. */
export const RenewalMessageEditsSchema = z
  .object({
    responseRequest: z
      .string()
      .trim()
      .max(700)
      .refine(
        (value) =>
          !/[\u0000-\u001f\u007f]|\{\{|\}\}|https?:\/\/|www\.|@|\$|\d/.test(value),
        "Keep amounts, dates, links and contacts in their labeled fact fields.",
      ),
  })
  .strict();
export type RenewalMessageEdits = z.infer<typeof RenewalMessageEditsSchema>;

export interface RenewalMessageFacts {
  channel: "owner" | "tenant";
  names: string[];
  /**
   * S163: the provider's own first name for each entry of `names`, index-aligned; null where the
   * source records none. A first name is never derived from a display or company name.
   */
  firstNames?: Array<string | null>;
  address: string | null;
  currentBaseRent: { value: number; source: string } | null;
  leaseEndDate: string | null;
  /**
   * S156/S161: the renewal terms staff are working with (working terms first, then terms already
   * recorded with an owner response). Any of the three may still be unknown; an unknown value is a
   * named marker in the message, never a reason to withhold it.
   */
  ownerTerms: {
    rent: number | null;
    effectiveDate: string | null;
    endDate: string | null;
    source: string;
  } | null;
  range: { low: number; high: number; source: string } | null;
  suggestedRent: {
    value: number;
    source: string;
    kind?: "working_offer" | "provider_reference" | "reviewed";
  } | null;
  comps: Array<{
    address: string;
    rent: number;
    source: string;
    url?: string;
    distanceMiles?: number;
  }>;
  trend: string | null;
  sparseCompsQualification: string | null;
  charges: MessageCharge[];
  insuranceTransition: { applicable: boolean; source: string } | null;
  leaseOrigin: { kind: "pmi" | "third_party"; source: string } | null;
  otherChargesComparison: { unchanged: boolean; source: string } | null;
  informationForm: z.infer<typeof MessageLinkSchema> | null;
  insuranceFlyer: z.infer<typeof MessageLinkSchema> | null;
  rbpFlyer: z.infer<typeof MessageLinkSchema> | null;
  signature: ManagedMessageSignature | null;
  /** Only actual reviewed file identities belong here. The caller owns download and Gmail attachment readiness. */
  attachments: Array<{ filename: string; source: string }>;
}

export type MessageRun = {
  text: string;
  emphasis?: "name" | "role" | "strong";
  href?: string;
  breakBefore?: boolean;
};
export interface RenewalMessageContent {
  version: "v2.0";
  channel: "owner" | "tenant";
  subject: string;
  paragraphs: MessageRun[][];
  /** S161: the values this message does not have yet. Each one is a named marker or a general
   * wording in the text; none of them stops editing, copying or the unsent draft. */
  missing: Array<{ field: string; message: string }>;
  sourceRefs: string[];
  attachments: RenewalMessageFacts["attachments"];
  plainText: string;
  htmlBody: string;
}

/**
 * S161 (R-S161-4): the named fill-in marker for one value the message does not have yet, in the
 * existing "Needs Verification: <fact>" convention. It stays in copied text and in the unsent draft
 * so the person who sends the message sees exactly what is still open.
 */
export function missingValueMarker(fact: string): string {
  return `[${UNVERIFIED_PLACEHOLDER.replace("<fact>", fact)}]`;
}

/** True when text still carries at least one named fill-in marker. */
export function hasMissingValueMarker(text: string): boolean {
  return text.includes(`[${UNVERIFIED_PLACEHOLDER.split("<fact>")[0]}`);
}

/**
 * S163: the first names a greeting uses, and the people whose first name the source does not
 * record. Nothing is split, guessed or carried over from a display or company name.
 */
export function greetingFirstNames(
  facts: Pick<RenewalMessageFacts, "names" | "firstNames">,
): { known: string[]; unknown: string[] } {
  const known: string[] = [];
  const unknown: string[] = [];
  facts.names.forEach((name, index) => {
    const first = shortText.safeParse(facts.firstNames?.[index] ?? "");
    if (first.success) known.push(first.data);
    else {
      const label = shortText.safeParse(name);
      unknown.push(label.success ? label.data : "one person on this lease");
    }
  });
  return { known, unknown };
}

/**
 * Deterministic body preparation has no mailbox, provider, model, publication write or send
 * dependency. S161: composition never refuses. A value that is absent or unusable becomes a named
 * marker in the text and one entry in `missing`; nothing is invented in its place.
 */
export function composeRenewalMessage(
  facts: RenewalMessageFacts,
  rawEdits: RenewalMessageEdits = { responseRequest: "" },
): RenewalMessageContent {
  const paragraphs: MessageRun[][] = [];
  const missing: RenewalMessageContent["missing"] = [];
  const refs = new Set<string>();
  const add = (value: string) => paragraphs.push([{ text: value }]);
  const note = (field: string, message: string) => {
    if (!missing.some((entry) => entry.field === field && entry.message === message))
      missing.push({ field, message });
  };
  const sourced = (ref: string | null | undefined) => {
    const parsed = source.safeParse(ref ?? "");
    if (parsed.success) refs.add(parsed.data);
  };
  const text = (value: string | null | undefined) => {
    const parsed = shortText.safeParse(value ?? "");
    return parsed.success ? parsed.data : null;
  };
  const money = (value: number | null | undefined) => {
    const parsed = messageMoney.safeParse(value);
    return parsed.success
      ? parsed.data.toLocaleString("en-US", { style: "currency", currency: "USD" })
      : null;
  };
  const day = (value: string | null | undefined) => {
    const parsed = date.safeParse(value ?? "");
    return parsed.success ? formatCalendarDate(parsed.data) : null;
  };
  const link = (value: z.infer<typeof MessageLinkSchema> | null) => {
    const parsed = MessageLinkSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  };
  const editsResult = RenewalMessageEditsSchema.safeParse(rawEdits);
  const edits = editsResult.success ? editsResult.data : { responseRequest: "" };
  if (!editsResult.success)
    note(
      "responseRequest",
      "The response request wording keeps the approved paragraph until amounts, dates, links and contacts are taken out of it.",
    );

  // S163: first names for owners and tenants alike; a person without a recorded first name is
  // left out of the greeting and named in the callout, and the greeting stays editable.
  const greeting = greetingFirstNames(facts);
  add(greeting.known.length ? `Hello ${greeting.known.join(" and ")},` : "Hello,");
  if (!facts.names.length)
    note("names", "No first name is recorded, so the greeting is general.");
  for (const person of greeting.unknown)
    note(
      "names",
      greeting.known.length
        ? `No first name is recorded for ${person}, so the greeting leaves that name out.`
        : `No first name is recorded for ${person}, so the greeting is general.`,
    );

  const address = text(facts.address);
  if (!address) note("address", "The property address is not available yet.");
  const subject = fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.owner.subject, {
    property_address: address ?? missingValueMarker("property address"),
  });

  if (facts.channel === "owner") {
    add(
      fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.owner.introduction, {
        property_address: address ?? missingValueMarker("property address"),
      }),
    );
    const currentRent = money(facts.currentBaseRent?.value);
    if (currentRent) sourced(facts.currentBaseRent!.source);
    else note("currentBaseRent", "The current rent is not available yet.");
    add(
      fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.owner.currentRent, {
        current_base_rent: currentRent ?? missingValueMarker("current rent"),
      }),
    );
    const low = money(facts.range?.low);
    const high = money(facts.range?.high);
    const rangeKnown = Boolean(low && high && facts.range!.low <= facts.range!.high);
    if (rangeKnown) sourced(facts.range!.source);
    else note("range", "The comparable rent range is not available yet.");
    add(
      fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.owner.market, {
        market_low: rangeKnown ? low! : missingValueMarker("low comparable rent"),
        market_high: rangeKnown ? high! : missingValueMarker("high comparable rent"),
      }),
    );
    add(edits.responseRequest || SUPPLIED_RENEWAL_COPY.owner.request);
    let listed = 0;
    for (const { value: comp } of firstUsableComparables(facts.comps).entries) {
      const label = text(comp.address);
      const rent = money(comp.rent);
      if (!label || !rent) continue;
      sourced(comp.source);
      const href = comp.url
        ? link({ url: comp.url, source: comp.source })?.url
        : undefined;
      paragraphs.push([
        {
          text: `${label} — ${rent} per month · ${comparableDistanceLabel(comp.distanceMiles)}`,
          ...(href ? { href } : {}),
        },
      ]);
      listed += 1;
    }
    if (!listed && !facts.attachments.length) {
      add(missingValueMarker("comparable listings"));
      note("comps", "Comparable listings are not saved yet.");
    }
    const sparse = text(facts.sparseCompsQualification);
    if (sparse) add(sparse);
    const trend = text(facts.trend);
    if (trend) add(trend);
    const suggested = money(facts.suggestedRent?.value);
    if (suggested) {
      sourced(facts.suggestedRent!.source);
      add(
        facts.suggestedRent!.kind === "working_offer"
          ? `Our working renewal offer is ${suggested} per month.`
          : facts.suggestedRent!.kind === "provider_reference"
            ? `${facts.suggestedRent!.source}: ${suggested} per month. The working offer remains a staff decision.`
            : fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.owner.suggestion, {
                suggested_rent: suggested,
              }),
      );
    }
    add(SUPPLIED_RENEWAL_COPY.owner.consideration);
    add(SUPPLIED_RENEWAL_COPY.owner.closing);
  } else {
    const leaseEnd = day(facts.leaseEndDate);
    if (!leaseEnd) note("leaseEndDate", "The lease end date is not available yet.");
    add(
      fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.tenant.introduction, {
        lease_end_date: leaseEnd ?? missingValueMarker("lease end date"),
      }),
    );
    // S156/S161 (R-S161-2): the terms staff are working with fill the offer whether or not an
    // owner response is recorded. Each unknown term is its own named marker.
    const terms = facts.ownerTerms;
    const rent = money(terms?.rent);
    const start = day(terms?.effectiveDate);
    const end = day(terms?.endDate);
    if (terms && (rent || start || end)) sourced(terms.source);
    if (!rent) note("ownerTerms", "The renewal rent is not entered yet.");
    if (!start) note("ownerTerms", "The renewal start date is not entered yet.");
    if (!end) note("ownerTerms", "The renewal end date is not entered yet.");
    if (start && end && terms!.endDate! <= terms!.effectiveDate!)
      note("ownerTerms", "The renewal end date is not after the start date.");
    add(
      fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.tenant.terms, {
        rent: rent ?? missingValueMarker("renewal rent"),
        start: start ?? missingValueMarker("renewal start date"),
        end: end ?? missingValueMarker("renewal end date"),
      }),
    );
    if (facts.leaseOrigin) sourced(facts.leaseOrigin.source);
    const ids = new Set<string>();
    const included: MessageCharge[] = [];
    for (const raw of facts.charges) {
      const parsed = MessageChargeSchema.safeParse(raw);
      if (!parsed.success || ids.has(parsed.data.id)) continue;
      const charge = parsed.data;
      ids.add(charge.id);
      // Only a charge staff marked as applying is listed. An unanswered charge adds no question.
      if (charge.applicable !== true) continue;
      sourced(charge.source);
      included.push(charge);
    }
    // Recurring and one-time charges keep their own headings; a charge whose cadence is not
    // entered yet is listed after them with that gap marked.
    for (const cadence of ["monthly", "one_time", null] as const) {
      const selected = included.filter((charge) => charge.cadence === cadence);
      if (!selected.length) continue;
      if (cadence)
        add(
          cadence === "monthly"
            ? SUPPLIED_RENEWAL_COPY.tenant.monthlyHeading
            : SUPPLIED_RENEWAL_COPY.tenant.oneTimeHeading,
        );
      for (const charge of selected) {
        const label = MESSAGE_CHARGES[charge.id];
        const amount = money(charge.amount);
        const effective = day(charge.effectiveDate);
        if (!amount)
          note(`charge.${charge.id}`, `${label}: the amount is not entered yet.`);
        if (!cadence)
          note(`charge.${charge.id}`, `${label}: monthly or one time is not chosen yet.`);
        if (!effective)
          note(`charge.${charge.id}`, `${label}: the start date is not entered yet.`);
        add(
          fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.tenant.chargeLine, {
            label,
            amount: amount ?? missingValueMarker(`${label} amount`),
            cadence:
              cadence === "monthly"
                ? SUPPLIED_RENEWAL_COPY.tenant.monthlyCadence
                : cadence === "one_time"
                  ? SUPPLIED_RENEWAL_COPY.tenant.oneTimeCadence
                  : ` ${missingValueMarker(`${label} monthly or one time`)}`,
            effective_date: effective ?? missingValueMarker(`${label} start date`),
          }),
        );
      }
    }
    if (facts.otherChargesComparison) {
      sourced(facts.otherChargesComparison.source);
      if (facts.otherChargesComparison.unchanged)
        add(SUPPLIED_RENEWAL_COPY.tenant.unchanged);
    }
    const insurance = included.find((charge) => charge.id === "insurance");
    if (insurance && !facts.insuranceTransition)
      note(
        "insuranceTransition",
        "The insurance transition wording is left out until you choose whether it applies.",
      );
    if (facts.insuranceTransition) {
      sourced(facts.insuranceTransition.source);
      if (facts.insuranceTransition.applicable) {
        add(SUPPLIED_RENEWAL_COPY.tenant.insuranceChange);
        const flyer = link(facts.insuranceFlyer);
        if (flyer) {
          sourced(flyer.source);
          paragraphs.push([
            { text: SUPPLIED_RENEWAL_COPY.tenant.insuranceLinkLabel, href: flyer.url },
          ]);
        } else {
          // R-S161-9: a missing resource stays an explicit marker; no link is made up.
          add(missingValueMarker("insurance flyer link"));
          note("insuranceFlyer", "The insurance flyer link is not saved yet.");
        }
      }
    }
    const rbp = included.find(
      (charge) =>
        charge.id === "rbp" &&
        (charge.comparison === "changed" || charge.comparison === "new"),
    );
    if (rbp) {
      const flyer = link(facts.rbpFlyer);
      if (flyer) {
        sourced(flyer.source);
        paragraphs.push([
          { text: SUPPLIED_RENEWAL_COPY.tenant.rbpLinkLabel, href: flyer.url },
        ]);
      } else {
        add(missingValueMarker("Resident Benefits Package information link"));
        note("rbpFlyer", "The Resident Benefits Package link is not saved yet.");
      }
    }
    add(edits.responseRequest || SUPPLIED_RENEWAL_COPY.tenant.response);
    add(SUPPLIED_RENEWAL_COPY.tenant.informationForm);
    const form = link(facts.informationForm);
    if (form) {
      sourced(form.source);
      paragraphs.push([
        { text: SUPPLIED_RENEWAL_COPY.tenant.informationLinkLabel, href: form.url },
      ]);
    } else {
      add(missingValueMarker("renewal information form link"));
      note("informationForm", "The renewal information form link is not saved yet.");
    }
  }
  for (const attachment of facts.attachments) sourced(attachment.source);
  // Attachments stay outside copy: clipboard HTML does not transfer attachment bytes.
  add(SUPPLIED_RENEWAL_COPY.signoff);
  const signature = ManagedMessageSignatureSchema.safeParse(facts.signature);
  if (signature.success) {
    const value = signature.data;
    sourced(value.source);
    const lines: MessageRun[] = [{ text: value.name, emphasis: "name" }];
    if (value.role) lines.push({ text: value.role, emphasis: "role" });
    for (const line of [value.phone, value.hours]) if (line) lines.push({ text: line });
    lines.push({ text: value.email, href: `mailto:${value.email}` });
    if (value.website) {
      sourced(value.website.source);
      lines.push({ text: value.website.url, href: value.website.url });
    }
    paragraphs.push(
      lines.map((r, index) => ({ ...r, ...(index ? { breakBefore: true } : {}) })),
    );
  } else {
    add(missingValueMarker("sender signature"));
    note("signature", "Your sender signature is not entered yet.");
  }
  const exactParagraphs =
    facts.channel === "owner" ? emphasizeOwnerFacts(paragraphs, address) : paragraphs;
  return {
    version: "v2.0",
    channel: facts.channel,
    subject,
    paragraphs: exactParagraphs,
    missing,
    sourceRefs: [...refs].sort(),
    attachments: facts.attachments.map((value) => ({ ...value })),
    ...renderMessageParagraphs(exactParagraphs),
  };
}

/** Segment style ranges before escaping; raw HTML or markdown never becomes content. */
function emphasizeOwnerFacts(
  paragraphs: MessageRun[][],
  address: string | null,
): MessageRun[][] {
  return paragraphs.map((p) =>
    p.flatMap((run) => {
      const ranges: Array<{ start: number; end: number }> = [];
      for (const m of run.text.matchAll(/\$\d[\d,]*(?:\.\d{2})?/g))
        ranges.push({ start: m.index!, end: m.index! + m[0].length });
      if (address) {
        let from = 0;
        for (;;) {
          const at = run.text.indexOf(address, from);
          if (at < 0) break;
          ranges.push({ start: at, end: at + address.length });
          from = at + address.length;
        }
      }
      ranges.sort((a, b) => a.start - b.start || b.end - a.end);
      if (!ranges.length) return [run];
      const parts: MessageRun[] = [];
      let from = 0;
      for (const r of ranges) {
        if (r.start < from) continue;
        if (r.start > from)
          parts.push({
            ...run,
            text: run.text.slice(from, r.start),
            ...(parts.length ? { breakBefore: false } : {}),
          });
        parts.push({
          ...run,
          text: run.text.slice(r.start, r.end),
          emphasis: "strong",
          ...(parts.length ? { breakBefore: false } : {}),
        });
        from = r.end;
      }
      if (from < run.text.length)
        parts.push({ ...run, text: run.text.slice(from), breakBefore: false });
      return parts;
    }),
  );
}
export function renderMessageParagraphs(paragraphs: MessageRun[][]): {
  plainText: string;
  htmlBody: string;
} {
  const rendered = paragraphs.map((p) =>
    renderInlineMessageParagraph(
      p.map((r) => ({
        text: (r.breakBefore ? "\n" : "") + r.text,
        bold: r.emphasis === "name" || r.emphasis === "strong",
        ...(r.emphasis === "role" ? { color: "#c2410c" } : {}),
        ...(r.href ? { href: r.href } : {}),
      })),
    ),
  );
  return {
    plainText: rendered.map((p) => p.plainText).join("\n\n"),
    htmlBody:
      '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#000000">' +
      rendered.map((p) => '<p style="margin:0 0 16px">' + p.html + "</p>").join("") +
      "</div>",
  };
}

export function escapeMessageHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}
