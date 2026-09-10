import { z } from "zod";

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

/** Replace only the named reviewed fields; unresolved authoring tokens never reach copy. */
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
  address: string | null;
  currentBaseRent: { value: number; source: string } | null;
  leaseEndDate: string | null;
  ownerTerms: {
    rent: number;
    effectiveDate: string;
    endDate: string;
    source: string;
  } | null;
  range: { low: number; high: number; source: string } | null;
  suggestedRent: { value: number; source: string } | null;
  comps: Array<{ address: string; rent: number; source: string; url?: string }>;
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

export type MessageRun = { text: string; emphasis?: "name" | "role"; href?: string };
export interface RenewalMessageContent {
  version: "v2.0";
  channel: "owner" | "tenant";
  subject: string;
  paragraphs: MessageRun[][];
  missing: Array<{ field: string; message: string }>;
  sourceRefs: string[];
  attachments: RenewalMessageFacts["attachments"];
  plainText: string;
  htmlBody: string;
}

/** Deterministic body preparation has no mailbox, provider, model, publication write or send dependency. */
export function composeRenewalMessage(
  facts: RenewalMessageFacts,
  rawEdits: RenewalMessageEdits = { responseRequest: "" },
): RenewalMessageContent {
  const edits = RenewalMessageEditsSchema.parse(rawEdits);
  const paragraphs: MessageRun[][] = [];
  const missing: RenewalMessageContent["missing"] = [];
  const refs = new Set<string>();
  const add = (value: string) => paragraphs.push([{ text: value }]);
  const require = (field: string, message: string) => missing.push({ field, message });
  const sourced = (ref: string) => refs.add(source.parse(ref));
  const money = (value: number) =>
    messageMoney
      .parse(value)
      .toLocaleString("en-US", { style: "currency", currency: "USD" });
  const names = facts.names.map((name) => shortText.parse(name));
  if (names.length) add(`Hello ${names.join(" and ")},`);
  else {
    add("Hello,");
    require("names", "Verify the names for this channel.");
  }
  const address = facts.address ? shortText.parse(facts.address) : null;
  if (!address) require("address", "Verify the property address.");
  let subject = address
    ? fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.owner.subject, { property_address: address })
    : "Lease Renewal";

  if (facts.channel === "owner") {
    if (address)
      add(
        fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.owner.introduction, {
          property_address: address,
        }),
      );
    if (facts.currentBaseRent) {
      sourced(facts.currentBaseRent.source);
      add(
        fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.owner.currentRent, {
          current_base_rent: money(facts.currentBaseRent.value),
        }),
      );
    } else require("currentBaseRent", "Resolve and review current base rent.");
    if (facts.range && facts.range.low <= facts.range.high) {
      sourced(facts.range.source);
      add(
        fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.owner.market, {
          market_low: money(facts.range.low),
          market_high: money(facts.range.high),
        }),
      );
    } else require("range", "Review a low and high comparable rent with its source.");
    add(edits.responseRequest || SUPPLIED_RENEWAL_COPY.owner.request);
    if (facts.comps.length) {
      for (const comp of facts.comps) {
        sourced(comp.source);
        const text = `${shortText.parse(comp.address)} — ${money(comp.rent)} per month`;
        paragraphs.push([
          {
            text,
            ...(comp.url
              ? {
                  href: MessageLinkSchema.parse({ url: comp.url, source: comp.source })
                    .url,
                }
              : {}),
          },
        ]);
      }
    } else if (!facts.attachments.length)
      require("comps", "Include reviewed comparable evidence or an actual reviewed attachment.");
    if (facts.sparseCompsQualification)
      add(shortText.parse(facts.sparseCompsQualification));
    if (facts.trend) add(shortText.parse(facts.trend));
    if (facts.suggestedRent) {
      sourced(facts.suggestedRent.source);
      add(
        fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.owner.suggestion, {
          suggested_rent: money(facts.suggestedRent.value),
        }),
      );
    }
    add(SUPPLIED_RENEWAL_COPY.owner.consideration);
    add(SUPPLIED_RENEWAL_COPY.owner.closing);
  } else {
    subject = address
      ? fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.owner.subject, {
          property_address: address,
        })
      : "Lease Renewal";
    if (facts.leaseEndDate)
      add(
        SUPPLIED_RENEWAL_COPY.tenant.introduction.replace(
          "{{lease_end_date}}",
          date.parse(facts.leaseEndDate),
        ),
      );
    else require("leaseEndDate", "Verify the current lease end date.");
    if (facts.ownerTerms) {
      sourced(facts.ownerTerms.source);
      const start = date.parse(facts.ownerTerms.effectiveDate);
      const end = date.parse(facts.ownerTerms.endDate);
      if (end <= start) throw new Error("The approved lease end must follow its start.");
      add(
        fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.tenant.terms, {
          rent: money(facts.ownerTerms.rent),
          start,
          end,
        }),
      );
    } else
      require("ownerTerms", "Record explicit owner approval of exact rent and dates.");
    if (!facts.leaseOrigin)
      require("leaseOrigin", "Review whether the current lease originated with PMI or a third party.");
    else sourced(facts.leaseOrigin.source);
    const ids = new Set<string>();
    const included: MessageCharge[] = [];
    for (const raw of facts.charges) {
      const charge = MessageChargeSchema.parse(raw);
      if (ids.has(charge.id))
        throw new Error("A charge may appear only once in the reviewed message.");
      ids.add(charge.id);
      if (charge.applicable === null)
        require(`charge.${charge.id}`, `Review whether ${MESSAGE_CHARGES[charge.id]} applies.`);
      if (charge.applicable === false && !charge.source)
        require(`charge.${charge.id}`, `Record the source for why ${MESSAGE_CHARGES[charge.id]} does not apply.`);
      if (charge.applicable !== true) continue;
      if (
        charge.amount === null ||
        charge.cadence === null ||
        charge.effectiveDate === null ||
        !charge.source ||
        charge.comparison === "unverified"
      ) {
        require(`charge.${charge.id}`, `Review the amount, cadence, effective date, source and comparison for ${MESSAGE_CHARGES[charge.id]}.`);
        continue;
      }
      sourced(charge.source);
      included.push(charge);
    }
    for (const id of Object.keys(MESSAGE_CHARGES) as Array<
      keyof typeof MESSAGE_CHARGES
    >) {
      if (!ids.has(id))
        require(`charge.${id}`, `Review whether ${MESSAGE_CHARGES[id]} applies.`);
    }
    for (const cadence of ["monthly", "one_time"] as const) {
      const selected = included.filter((charge) => charge.cadence === cadence);
      if (!selected.length) continue;
      add(
        cadence === "monthly"
          ? SUPPLIED_RENEWAL_COPY.tenant.monthlyHeading
          : SUPPLIED_RENEWAL_COPY.tenant.oneTimeHeading,
      );
      for (const charge of selected)
        add(
          fillSuppliedCopy(SUPPLIED_RENEWAL_COPY.tenant.chargeLine, {
            label: MESSAGE_CHARGES[charge.id],
            amount: money(charge.amount!),
            cadence:
              cadence === "monthly"
                ? SUPPLIED_RENEWAL_COPY.tenant.monthlyCadence
                : SUPPLIED_RENEWAL_COPY.tenant.oneTimeCadence,
            effective_date: charge.effectiveDate!,
          }),
        );
    }
    if (facts.otherChargesComparison) {
      sourced(facts.otherChargesComparison.source);
      if (facts.otherChargesComparison.unchanged)
        add(SUPPLIED_RENEWAL_COPY.tenant.unchanged);
    }
    const insurance = included.find((charge) => charge.id === "insurance");
    if (insurance && !facts.insuranceTransition)
      require("insuranceTransition", "Review whether the supplied insurance transition wording applies.");
    if (facts.insuranceTransition) {
      sourced(facts.insuranceTransition.source);
      if (facts.insuranceTransition.applicable) {
        if (!insurance)
          require("charge.insurance", "The applicable insurance transition requires its reviewed charge.");
        if (facts.insuranceFlyer) {
          sourced(facts.insuranceFlyer.source);
          add(SUPPLIED_RENEWAL_COPY.tenant.insuranceChange);
          paragraphs.push([
            {
              text: SUPPLIED_RENEWAL_COPY.tenant.insuranceLinkLabel,
              href: MessageLinkSchema.parse(facts.insuranceFlyer).url,
            },
          ]);
        } else
          require("insuranceFlyer", "Add and verify the applicable insurance flyer link.");
      }
    }
    const rbp = included.find(
      (charge) =>
        charge.id === "rbp" &&
        (charge.comparison === "changed" || charge.comparison === "new"),
    );
    if (rbp) {
      if (facts.rbpFlyer) {
        sourced(facts.rbpFlyer.source);
        paragraphs.push([
          {
            text: SUPPLIED_RENEWAL_COPY.tenant.rbpLinkLabel,
            href: MessageLinkSchema.parse(facts.rbpFlyer).url,
          },
        ]);
      } else
        require("rbpFlyer", "Verify the applicable Resident Benefits Package flyer link.");
    }
    add(edits.responseRequest || SUPPLIED_RENEWAL_COPY.tenant.response);
    if (facts.informationForm) {
      sourced(facts.informationForm.source);
      add(SUPPLIED_RENEWAL_COPY.tenant.informationForm);
      paragraphs.push([
        {
          text: SUPPLIED_RENEWAL_COPY.tenant.informationLinkLabel,
          href: MessageLinkSchema.parse(facts.informationForm).url,
        },
      ]);
    } else
      require("informationForm", "Add and verify the renewal information form link when needed for the final message.");
  }
  for (const attachment of facts.attachments) sourced(attachment.source);
  // Attachments stay outside copy: clipboard HTML does not transfer attachment bytes.
  add(SUPPLIED_RENEWAL_COPY.signoff);
  if (facts.signature) {
    const signature = ManagedMessageSignatureSchema.parse(facts.signature);
    sourced(signature.source);
    const lines: MessageRun[] = [{ text: signature.name, emphasis: "name" }];
    if (signature.role) lines.push({ text: signature.role, emphasis: "role" });
    for (const text of [signature.phone, signature.hours]) if (text) lines.push({ text });
    lines.push({ text: signature.email, href: `mailto:${signature.email}` });
    if (signature.website) {
      sourced(signature.website.source);
      lines.push({ text: signature.website.url, href: signature.website.url });
    }
    paragraphs.push(lines);
  } else
    require("signature", "Review the current managed sender's signature; the example sender is not reused.");
  return {
    version: "v2.0",
    channel: facts.channel,
    subject,
    paragraphs,
    missing,
    sourceRefs: [...refs].sort(),
    attachments: facts.attachments.map((value) => ({ ...value })),
    ...renderMessageParagraphs(paragraphs),
  };
}

export function renderMessageParagraphs(paragraphs: MessageRun[][]): {
  plainText: string;
  htmlBody: string;
} {
  const plainText = paragraphs
    .map((runs) =>
      runs
        .map((run) =>
          run.href && run.href !== run.text && run.href !== `mailto:${run.text}`
            ? `${run.text}: ${run.href}`
            : run.text,
        )
        .join("\n"),
    )
    .join("\n\n");
  const htmlBody =
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#000000">' +
    paragraphs
      .map(
        (runs) =>
          '<p style="margin:0 0 16px">' +
          runs
            .map((run) => {
              let content = escapeMessageHtml(run.text);
              if (run.emphasis === "name") content = `<strong>${content}</strong>`;
              if (run.emphasis === "role")
                content = `<span style="color:#c2410c">${content}</span>`;
              if (run.href) {
                if (
                  !/^https:\/\//.test(run.href) &&
                  !/^mailto:[^\s<>"@]+@pmikcmetro\.com$/i.test(run.href)
                )
                  throw new Error("Unsupported message link.");
                content = `<a href="${escapeMessageHtml(run.href)}">${content}</a>`;
              }
              return content;
            })
            .join("<br>") +
          "</p>",
      )
      .join("") +
    "</div>";
  return { plainText, htmlBody };
}

export function escapeMessageHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}
