import { describe, expect, it } from "vitest";

import {
  composeRenewalMessage,
  SUPPLIED_RENEWAL_COPY,
  type MessageCharge,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import { projectMessageReadiness } from "@/lib/lease-renewal/message-readiness";
import { outgoingRenewalReasons } from "@/lib/lease-renewal/outgoing-message-readiness";
import { applyRefinedBody } from "@/lib/lease-renewal/refined-message";
import {
  TENANT_RESOURCE_PURPOSES,
  tenantResourceSourceRef,
  tenantResourceUse,
  type FrozenTenantResource,
  type TenantResourceId,
} from "@/lib/lease-renewal/tenant-resource-evidence";
import {
  currentTenantResourceDecisions,
  projectTenantResourceRequirements,
} from "@/lib/lease-renewal/tenant-resource-decisions";
import {
  applyTenantResourceInclusion,
  tenantResourceStatesFromUses,
} from "@/lib/lease-renewal/tenant-resource-inclusion";

// S265 AC-S265-2 (R-S265-2, ARCH-S265-2, BEH-S265-2): one inclusion projection over the exact final
// tenant message, including supported wording edits. Changed or new RBP needs the RBP flyer, an
// applicable insurance transition needs its flyer and wording, and the optional information form
// is included only with a usable link (or deliberately, with its instructions). An unset form adds
// no placeholder and no hold. An included resource without proof holds only that review with its
// exact Connections fix; a material unknown transition stays held even with a verified link.
// Synthetic values only.

const TODAY = "2026-11-12";
const RECIPIENTS = ["tenant-one@fixture-rental.net"];
const URLS: Record<TenantResourceId, string> = {
  insurance_flyer: "https://fixture-rental.net/insurance-flyer.pdf",
  rbp_flyer: "https://fixture-rental.net/rbp-flyer.pdf",
  renewal_information_form: "https://fixture-rental.net/renewal-form",
};

function checkedEntry(
  id: TenantResourceId,
  audience: { kind: "tenant_wide" } | { kind: "restricted"; recipients: string[] } = {
    kind: "tenant_wide",
  },
) {
  return {
    id,
    url: URLS[id],
    verified: true,
    tenantAccess: {
      purpose: TENANT_RESOURCE_PURPOSES[id],
      destination: URLS[id],
      documentVersion: `${id} 2026-11`,
      audience,
      method: audience.kind === "tenant_wide" ? "signed_out_open" : "sharing_list",
      result: "current_document",
      checkedBy: "Fixture Resource Owner",
      checkedOn: "2026-11-10",
      validUntil: "2026-12-31",
      proof: {
        id: id
          .replace(/[^a-f]/g, "a")
          .padEnd(32, "b")
          .slice(0, 32),
        version: 3,
      },
    },
  };
}
function legacyEntry(id: TenantResourceId) {
  return { id, url: URLS[id], verified: true };
}
type EntryState = "verified" | "legacy" | "blank";
function uses(states: Partial<Record<TenantResourceId, EntryState>>) {
  const entry = (id: TenantResourceId) =>
    states[id] === "verified"
      ? checkedEntry(id)
      : states[id] === "legacy"
        ? legacyEntry(id)
        : undefined;
  return {
    insurance_flyer: tenantResourceUse(
      "insurance_flyer",
      entry("insurance_flyer"),
      TODAY,
    ),
    rbp_flyer: tenantResourceUse("rbp_flyer", entry("rbp_flyer"), TODAY),
    renewal_information_form: tenantResourceUse(
      "renewal_information_form",
      entry("renewal_information_form"),
      TODAY,
    ),
  };
}

/** The facts the server composes from: usable links and each pending reason by field. */
function tenantFacts(
  states: Partial<Record<TenantResourceId, EntryState>>,
  change: {
    rbp?: MessageCharge["comparison"] | null;
    insurance?: boolean;
    transition?: boolean | null;
  } = {},
  overrides: Partial<RenewalMessageFacts> = {},
): RenewalMessageFacts {
  const current = uses(states);
  const inputs = emptyMessagePreparationInputs();
  const link = (id: TenantResourceId) => {
    const use = current[id];
    return use.state === "usable"
      ? { url: use.url, source: tenantResourceSourceRef(use.evidence) }
      : null;
  };
  const reason = (id: TenantResourceId) => {
    const use = current[id];
    return use.state === "usable" ? undefined : use.reason;
  };
  return {
    outgoingContract: true,
    signatureConfigured: true,
    channel: "tenant",
    names: ["Fixture Tenant"],
    firstNames: ["Fixture"],
    address: "701 Fixture Lane",
    currentBaseRent: null,
    leaseEndDate: "2026-12-31",
    ownerTerms: {
      rent: 1100,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
      source: "Working renewal terms",
    },
    range: null,
    suggestedRent: null,
    comps: [],
    trend: null,
    sparseCompsQualification: null,
    charges: inputs.charges.map((charge) => ({
      ...charge,
      applicable:
        charge.id === "rbp"
          ? change.rbp !== undefined && change.rbp !== null
          : charge.id === "insurance"
            ? change.insurance === true
            : false,
      amount: charge.id === "rbp" || charge.id === "insurance" ? 25 : null,
      cadence: charge.id === "rbp" || charge.id === "insurance" ? "monthly" : null,
      effectiveDate:
        charge.id === "rbp" || charge.id === "insurance" ? "2027-01-01" : null,
      source: "Fixture reviewed charges",
      comparison: charge.id === "rbp" && change.rbp ? change.rbp : "unverified",
    })),
    insuranceTransition:
      change.transition === undefined || change.transition === null
        ? null
        : { applicable: change.transition, source: "Fixture reviewed transition" },
    leaseOrigin: { kind: "pmi", source: "Fixture original lease" },
    otherChargesComparison: null,
    informationForm: link("renewal_information_form"),
    insuranceFlyer: link("insurance_flyer"),
    rbpFlyer: link("rbp_flyer"),
    resourcePending: {
      ...(reason("insurance_flyer") ? { insuranceFlyer: reason("insurance_flyer") } : {}),
      ...(reason("rbp_flyer") ? { rbpFlyer: reason("rbp_flyer") } : {}),
      ...(reason("renewal_information_form")
        ? { informationForm: reason("renewal_information_form") }
        : {}),
    },
    signature: {
      name: "Fixture Staff",
      email: "fixture-staff@pmikcmetro.com",
      source: "Fixture signed-in staff",
      role: null,
      phone: null,
      hours: null,
      website: null,
    },
    attachments: [],
    ...overrides,
  };
}

/** The server path: compose, apply authored wording, then the one inclusion projection. */
function review(
  facts: RenewalMessageFacts,
  states: Partial<Record<TenantResourceId, EntryState>>,
  options: { authored?: (plain: string) => string; recipients?: string[] } = {},
) {
  let content = composeRenewalMessage(facts);
  if (options.authored)
    content = applyRefinedBody(content, options.authored(content.plainText));
  const applied = applyTenantResourceInclusion(content, facts, {
    states: tenantResourceStatesFromUses(uses(states)),
    recipients: options.recipients ?? RECIPIENTS,
  });
  return {
    ...applied,
    outgoing: outgoingRenewalReasons({
      content: applied.content,
      signatureConfigured: true,
      reply: false,
    }),
    readiness: projectMessageReadiness({
      channel: "tenant",
      missing: applied.content.missing,
    }),
  };
}
const includedIds = (included: readonly FrozenTenantResource[]) =>
  included.map((entry) => entry.id);

describe("S265 AC-S265-2: inclusion over the exact final tenant message", () => {
  it("changed or new RBP needs its flyer; a verified flyer is included and frozen, an unproven one holds with its exact fix", () => {
    for (const comparison of ["changed", "new"] as const) {
      const ready = review(tenantFacts({ rbp_flyer: "verified" }, { rbp: comparison }), {
        rbp_flyer: "verified",
      });
      expect(ready.content.plainText).toContain(
        `${SUPPLIED_RENEWAL_COPY.tenant.rbpLinkLabel}: ${URLS.rbp_flyer}`,
      );
      expect(includedIds(ready.inclusion.included)).toEqual(["rbp_flyer"]);
      expect(ready.outgoing).toEqual([]);

      const held = review(tenantFacts({ rbp_flyer: "legacy" }, { rbp: comparison }), {
        rbp_flyer: "legacy",
      });
      expect(held.content.plainText).not.toContain(URLS.rbp_flyer);
      expect(held.content.plainText).toContain(
        "[Needs Verification: Resident Benefits Package information link]",
      );
      const note =
        "The Resident Benefits Package information link is Source pending. No tenant audience check is recorded for this link.";
      expect(held.outgoing).toContain(note);
      const item = held.readiness.items.find((entry) => entry.field === "rbpFlyer");
      expect(item).toMatchObject({
        message: note,
        target: { kind: "route", href: "/connections#renewal-resource-entry-rbp_flyer" },
      });
      // The draft and its other preparation stay available: the message still composes.
      expect(held.content.plainText).toContain("Rent: $1,100.00 per month");
      expect(held.inclusion.included).toEqual([]);
    }
  });

  it("unchanged RBP needs no flyer: an unproven flyer adds nothing and holds nothing", () => {
    const result = review(tenantFacts({ rbp_flyer: "legacy" }, { rbp: "unchanged" }), {
      rbp_flyer: "legacy",
    });
    expect(result.content.plainText).not.toMatch(/Resident Benefits Package information/);
    expect(result.content.missing.map((entry) => entry.field)).not.toContain("rbpFlyer");
    expect(result.outgoing).toEqual([]);
    expect(result.inclusion.includedIds).toEqual([]);
  });

  it("an applicable insurance transition needs its flyer and wording; inapplicable needs neither", () => {
    const applies = review(
      tenantFacts({ insurance_flyer: "verified" }, { insurance: true, transition: true }),
      { insurance_flyer: "verified" },
    );
    expect(applies.content.plainText).toContain(
      SUPPLIED_RENEWAL_COPY.tenant.insuranceChange,
    );
    expect(applies.content.plainText).toContain(
      `Insurance flyer: ${URLS.insurance_flyer}`,
    );
    expect(includedIds(applies.inclusion.included)).toEqual(["insurance_flyer"]);
    expect(applies.outgoing).toEqual([]);

    const pending = review(
      tenantFacts({ insurance_flyer: "blank" }, { insurance: true, transition: true }),
      { insurance_flyer: "blank" },
    );
    expect(pending.outgoing).toContain(
      "The insurance flyer link is Source pending. No link is saved yet.",
    );
    expect(
      pending.readiness.items.find((entry) => entry.field === "insuranceFlyer")?.target,
    ).toMatchObject({ href: "/connections#renewal-resource-entry-insurance_flyer" });

    const inapplicable = review(
      tenantFacts({ insurance_flyer: "blank" }, { insurance: true, transition: false }),
      { insurance_flyer: "blank" },
    );
    expect(inapplicable.content.plainText).not.toMatch(/insurance flyer/i);
    expect(inapplicable.outgoing).toEqual([]);
    expect(inapplicable.inclusion.includedIds).toEqual([]);
  });

  it("a material unknown transition stays held even with an otherwise verified link", () => {
    // Today's seam: an insurance charge with no transition choice leaves its wording and flyer out.
    const facts = tenantFacts(
      { insurance_flyer: "verified" },
      { insurance: true, transition: null },
    );
    const result = review(facts, { insurance_flyer: "verified" });
    expect(result.content.plainText).not.toMatch(/insurance flyer/i);
    expect(result.content.missing.map((entry) => entry.field)).toContain(
      "insuranceTransition",
    );
    expect(result.inclusion.holds).toEqual(["insurance_transition"]);
    expect(result.inclusion.included).toEqual([]);
    // S264's decisions feed the same projection: an unknown RBP change holds the review and keeps
    // a verified flyer out until it is resolved.
    const fed = review(
      tenantFacts(
        { rbp_flyer: "verified" },
        { rbp: "changed" },
        {
          resourceDecisions: {
            insuranceTransition: null,
            rbpChange: "unknown",
            informationForm: "when_usable",
          },
        },
      ),
      { rbp_flyer: "verified" },
    );
    expect(fed.inclusion.holds).toEqual(["rbp_change"]);
    expect(fed.content.plainText).not.toContain(URLS.rbp_flyer);
    expect(fed.outgoing.some((reason) => /Resident Benefits Package/.test(reason))).toBe(
      true,
    );
    expect(
      projectTenantResourceRequirements(
        { insuranceTransition: "unknown", rbpChange: "unknown", informationForm: "omit" },
        true,
      ),
    ).toEqual({
      required: [],
      informationForm: "omitted",
      holds: ["insurance_transition", "rbp_change"],
    });
  });

  it("an unset optional form yields neither an outgoing placeholder nor a hold; a usable one keeps its request and link together", () => {
    for (const state of ["blank", "legacy"] as const) {
      const omitted = review(tenantFacts({ renewal_information_form: state }), {
        renewal_information_form: state,
      });
      expect(omitted.content.plainText).not.toMatch(/information form/i);
      expect(omitted.content.plainText).not.toContain("Needs Verification");
      expect(omitted.content.missing).toEqual([]);
      expect(omitted.outgoing).toEqual([]);
      expect(omitted.readiness.complete).toBe(true);
    }
    const included = review(tenantFacts({ renewal_information_form: "verified" }), {
      renewal_information_form: "verified",
    });
    const text = included.content.plainText;
    expect(text).toContain(SUPPLIED_RENEWAL_COPY.tenant.informationForm);
    expect(text).toContain(`Renewal information form: ${URLS.renewal_information_form}`);
    expect(includedIds(included.inclusion.included)).toEqual([
      "renewal_information_form",
    ]);
  });

  it("a deliberately included form requires a verified link; a deliberately omitted one stays out", () => {
    const include = {
      resourceDecisions: {
        insuranceTransition: null,
        rbpChange: null,
        informationForm: "include" as const,
      },
    };
    const held = review(
      tenantFacts({ renewal_information_form: "legacy" }, {}, include),
      {
        renewal_information_form: "legacy",
      },
    );
    expect(held.content.plainText).toContain(
      SUPPLIED_RENEWAL_COPY.tenant.informationForm,
    );
    expect(held.outgoing).toContain(
      "The renewal information form link is Source pending. No tenant audience check is recorded for this link.",
    );
    const omit = review(
      tenantFacts(
        { renewal_information_form: "verified" },
        {},
        {
          resourceDecisions: {
            insuranceTransition: null,
            rbpChange: null,
            informationForm: "omit",
          },
        },
      ),
      { renewal_information_form: "verified" },
    );
    expect(omit.content.plainText).not.toMatch(/information form/i);
    expect(omit.inclusion.included).toEqual([]);
  });

  it("an authored resource clause without a usable link holds that review with its fix", () => {
    const facts = tenantFacts({ renewal_information_form: "legacy" });
    const result = review(
      facts,
      { renewal_information_form: "legacy" },
      {
        authored: (plain) =>
          plain.replace(
            SUPPLIED_RENEWAL_COPY.tenant.response,
            `${SUPPLIED_RENEWAL_COPY.tenant.response}\n\nPlease also complete the renewal information form we will send.`,
          ),
      },
    );
    expect(result.inclusion.includedIds).toEqual(["renewal_information_form"]);
    expect(result.outgoing).toContain(
      "The renewal information form link is Source pending. No tenant audience check is recorded for this link.",
    );
    expect(
      result.readiness.items.find((entry) => entry.field === "informationForm")?.target,
    ).toMatchObject({
      href: "/connections#renewal-resource-entry-renewal_information_form",
    });
  });

  it("a changed URL in edited wording, a dropped required flyer and a dropped form request each need exact review", () => {
    const facts = tenantFacts(
      { insurance_flyer: "verified", renewal_information_form: "verified" },
      { insurance: true, transition: true },
    );
    const states = {
      insurance_flyer: "verified",
      renewal_information_form: "verified",
    } as const;
    const changed = review(facts, states, {
      authored: (plain) =>
        plain.replace(URLS.insurance_flyer, "https://fixture-rental.net/old-flyer.pdf"),
    });
    expect(changed.outgoing).toContain(
      "The insurance flyer link in this message is not its current saved link. Use the current link or review the wording again.",
    );
    expect(changed.inclusion.included.map((entry) => entry.id)).toEqual([
      "renewal_information_form",
    ]);
    const dropped = review(facts, states, {
      authored: (plain) =>
        plain
          .split("\n\n")
          .filter((paragraph) => !/insurance/i.test(paragraph))
          .join("\n\n"),
    });
    expect(dropped.outgoing).toContain(
      "This offer needs the insurance flyer with its wording. The edited wording leaves it out.",
    );
    const formWithoutRequest = review(facts, states, {
      authored: (plain) =>
        plain.replace(SUPPLIED_RENEWAL_COPY.tenant.informationForm, ""),
    });
    expect(formWithoutRequest.outgoing).toContain(
      "Keep the renewal information form request and its verified link together.",
    );
  });

  it("a restricted proof that does not cover the message's actual recipient holds that resource", () => {
    const facts = tenantFacts({ renewal_information_form: "verified" });
    const restricted = {
      ...uses({ renewal_information_form: "verified" }),
      renewal_information_form: tenantResourceUse(
        "renewal_information_form",
        checkedEntry("renewal_information_form", {
          kind: "restricted",
          recipients: ["another-tenant@fixture-rental.net"],
        }),
        TODAY,
      ),
    };
    const result = applyTenantResourceInclusion(composeRenewalMessage(facts), facts, {
      states: tenantResourceStatesFromUses(restricted),
      recipients: RECIPIENTS,
    });
    expect(result.inclusion.problems).toEqual([
      expect.objectContaining({
        resourceId: "renewal_information_form",
        kind: "audience_not_covered",
      }),
    ]);
    expect(result.inclusion.included).toEqual([]);
  });

  it("the reviewed payload freezes only included resources; a change to an omitted one adds nothing", () => {
    const facts = tenantFacts(
      {
        rbp_flyer: "verified",
        insurance_flyer: "verified",
        renewal_information_form: "verified",
      },
      { rbp: "changed" },
      {
        resourceDecisions: {
          insuranceTransition: null,
          rbpChange: "changed",
          informationForm: "omit",
        },
      },
    );
    const result = review(facts, {
      rbp_flyer: "verified",
      insurance_flyer: "verified",
      renewal_information_form: "verified",
    });
    expect(result.inclusion.included.map((entry) => entry.id)).toEqual(["rbp_flyer"]);
    expect(result.inclusion.included[0]).toMatchObject({
      url: URLS.rbp_flyer,
      purpose: TENANT_RESOURCE_PURPOSES.rbp_flyer,
      documentVersion: "rbp_flyer 2026-11",
      audience: { kind: "tenant_wide" },
      proof: { version: 3 },
      validUntil: "2026-12-31",
    });
  });

  it("today's inputs are the default decision source S264 can replace", () => {
    expect(
      currentTenantResourceDecisions({
        charges: [
          { id: "rbp", applicable: true, comparison: "new" },
          { id: "insurance", applicable: true, comparison: "unverified" },
        ],
        insuranceTransition: null,
      }),
    ).toEqual({
      insuranceTransition: "unknown",
      rbpChange: "new",
      informationForm: "when_usable",
    });
    expect(
      currentTenantResourceDecisions({
        charges: [{ id: "rbp", applicable: true, comparison: "unverified" }],
        insuranceTransition: { applicable: false },
      }),
    ).toEqual({
      insuranceTransition: "does_not_apply",
      rbpChange: null,
      informationForm: "when_usable",
    });
  });

  it("other roles see the same exact destination with the Admin handoff", () => {
    const missing = [
      {
        field: "insuranceFlyer",
        message: "The insurance flyer link is Source pending. No link is saved yet.",
      },
    ];
    const admin = projectMessageReadiness({
      channel: "tenant",
      missing,
      canManageResources: true,
    });
    const editor = projectMessageReadiness({
      channel: "tenant",
      missing,
      canManageResources: false,
    });
    expect(admin.items[0].message).toBe(missing[0].message);
    expect(admin.items[0].target).toEqual(editor.items[0].target);
    expect(editor.items[0].message).toBe(
      `${missing[0].message} An Admin records the tenant audience check in Connections.`,
    );
  });
});
